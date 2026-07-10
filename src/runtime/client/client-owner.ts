import type { ConnectionState, ConvexClient } from 'convex/browser'
import { shallowRef, readonly, type Ref } from 'vue'

import type { AuthIdentityPort } from '../auth/identity-port'
import type { DevtoolsSink } from '../devtools/sink'
import type { ConvexIdentityKey } from '../utils/identity-key'
import { createLogger, type Logger } from '../utils/logger'
import { createIdentityChangedError } from './identity-changed-error'

/**
 * The per-Nuxt-app client owner (internal §4.1 `clients`, vNext §5.4).
 *
 * This is the single source of truth for the current primary `ConvexClient` and
 * the lazy anonymous `none` client. It owns:
 *   - the identity-scoped REPLACEABLE primary client (replaced on every stable
 *     identity-key change; same-user token rotation keeps the current client);
 *   - the LAZY anonymous client for `none` transport (constructed on first use;
 *     its WebSocket connects eagerly at construction, so lazy is mandatory);
 *   - retirement of the prior primary — close it, reject its in-flight
 *     consumer-held calls with `IDENTITY_CHANGED`;
 *   - one stable {@link ConvexClientHandle} (`query|mutation|action|onUpdate`)
 *     whose `onUpdate` listeners rebind A→B synchronously before B is published;
 *   - the connection-state store observed by `useConvexConnectionState`;
 *   - one deterministic disposer that closes every allocated client.
 *
 * The owner allocates NEITHER counter: `authEpoch`/`identityGeneration` are
 * supplied by the auth coordinator through {@link replacePrimary} /
 * {@link attachAuthPort} (internal §7.4). The owner interprets no tokens.
 */
export interface ConvexClientOwner {
  /** Immutable logger owned by this Nuxt application. */
  readonly logger: Logger
  /** Stable replacement-safe public handle returned by `useConvex()`. */
  readonly handle: ConvexClientHandle
  /** The current primary and its identity generation, or null if none exists. */
  getPrimary(): {
    client: OwnedConvexClient
    identityGeneration: number
  } | null
  /**
   * The `none`-transport anonymous client. In an auth-enabled build this is a
   * dedicated client that never receives `setAuth`; in an auth-disabled build
   * the permanently-anonymous primary is reused (vNext §7.5).
   */
  getAnonymous(): OwnedConvexClient
  /** Replace the primary for a new stable identity (internal §7.4). */
  replacePrimary(input: ReplacePrimaryInput): Promise<OwnedConvexClient>
  /**
   * Drive replacement reactively from the frozen auth port. On every
   * `identityGeneration` change the owner replaces the primary; an
   * `authEpoch`-only change (same-user token rotation) is ignored.
   */
  attachAuthPort(port: AuthIdentityPort): void
  /** Connection-state observation surface for `useConvexConnectionState`. */
  readonly connection: {
    readonly state: Readonly<Ref<ConnectionState>>
    /** Register one consumer; subscribes on first, unsubscribes on last. */
    addConsumer(): () => void
  }
  /** Register a teardown callback run by {@link dispose}. */
  addDisposer(dispose: () => void): void
  /** Current per-app diagnostics sink, present only while DevTools is active. */
  getDevtoolsSink(): DevtoolsSink | null
  /** Attach the per-app diagnostics sink; returns a detach function or null after disposal. */
  attachDevtoolsSink(sink: DevtoolsSink): (() => void) | null
  /** Idempotent teardown: closes primary + anonymous, drops all listeners. */
  dispose(): Promise<void>
}

/**
 * The public stable handle (vNext §5.4). Exactly `query | mutation | action |
 * onUpdate`; `connectionState`/`setAuth`/`clearAuth`/`close` are intentionally
 * absent. `onUpdate`'s return preserves the augmented `Unsubscribe` shape so the
 * handle stays assignable to `ConvexClient['onUpdate']`.
 */
export interface ConvexClientHandle {
  query: ConvexClient['query']
  mutation: ConvexClient['mutation']
  action: ConvexClient['action']
  onUpdate: ConvexClient['onUpdate']
}

/**
 * The narrow client surface the owner drives. `ConvexClient` satisfies it; the
 * owner depends on this shape (not the whole class) so unit tests can substitute
 * a double.
 */
export interface OwnedConvexClient {
  query: ConvexClient['query']
  mutation: ConvexClient['mutation']
  action: ConvexClient['action']
  onUpdate: ConvexClient['onUpdate']
  connectionState(): ConnectionState
  subscribeToConnectionState(cb: (state: ConnectionState) => void): () => void
  close(): Promise<void>
}

export interface ReplacePrimaryInput {
  /** The stable identity this replacement targets (diagnostics only). */
  identity: ConvexIdentityKey
  /** Epoch assigned by the auth coordinator; the owner never allocates it. */
  authEpoch: number
  /** Generation assigned by the auth coordinator; the owner never allocates it. */
  identityGeneration: number
  /**
   * Latest-revision-wins guard, checked synchronously immediately before commit
   * with no `await` between the guard and publication. A stale candidate closes
   * without publishing.
   */
  isCurrent: () => boolean
  /**
   * Confirm the candidate before publication. For an authenticated identity this
   * runs the auth port's server-confirmed handshake; the owner awaits it and
   * interprets nothing about tokens.
   */
  initialize: (candidate: OwnedConvexClient) => Promise<void>
}

export interface CreateConvexClientOwnerInput {
  /** Constructs the primary client and every replacement candidate. */
  primaryFactory: () => OwnedConvexClient
  /**
   * Constructs the dedicated `none` anonymous client. Omit in an auth-disabled
   * build so `getAnonymous()` reuses the already-anonymous primary (vNext §7.5).
   */
  anonymousFactory?: () => OwnedConvexClient
  /** Per-app logger. Tests and silent consumers default to the no-op logger. */
  logger?: Logger
}

const DEFAULT_CONNECTION_STATE: ConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: false,
  timeOfOldestInflightRequest: null,
  hasEverConnected: false,
  connectionCount: 0,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
}

interface OnUpdateEntry {
  query: unknown
  args: unknown
  callback: (result: unknown) => unknown
  onError?: (e: Error) => unknown
  underlying: ReturnType<ConvexClient['onUpdate']> | null
  active: boolean
}

interface PendingCall {
  generation: number
  reject: (reason: unknown) => void
}

export function createConvexClientOwner(input: CreateConvexClientOwnerInput): ConvexClientOwner {
  const { primaryFactory, anonymousFactory, logger = createLogger(false) } = input

  let primary: OwnedConvexClient | null = primaryFactory()
  let currentIdentityGeneration = 0
  let anonymous: OwnedConvexClient | null = null
  let disposed = false
  let resolveDisposed!: () => void
  const disposedSignal = new Promise<void>((resolve) => {
    resolveDisposed = resolve
  })
  let disposePromise: Promise<void> | null = null
  let replacementInFlight: Promise<OwnedConvexClient> | null = null
  const replacementCandidates = new Set<OwnedConvexClient>()
  const closedReplacementCandidates = new WeakSet<OwnedConvexClient>()
  let devtoolsSink: DevtoolsSink | null = null

  const listeners = new Set<OnUpdateEntry>()
  const pendingCalls = new Set<PendingCall>()
  const disposers = new Set<() => void>()

  function closeReplacementCandidate(candidate: OwnedConvexClient): Promise<void> {
    if (closedReplacementCandidates.has(candidate)) return Promise.resolve()
    closedReplacementCandidates.add(candidate)
    return candidate.close()
  }

  // ---- connection-state store (owned here; §4.1 single ownership) ----------
  const connectionState = shallowRef<ConnectionState>({
    ...DEFAULT_CONNECTION_STATE,
  })
  let connectionUnsubscribe: (() => void) | null = null
  let connectionConsumers = 0

  function subscribeConnection() {
    if (!primary || connectionUnsubscribe) return
    connectionState.value = primary.connectionState()
    connectionUnsubscribe = primary.subscribeToConnectionState((state) => {
      connectionState.value = state
    })
  }
  function unsubscribeConnection() {
    connectionUnsubscribe?.()
    connectionUnsubscribe = null
  }
  // On replacement: reset synchronously to the disconnected default, drop the
  // old subscription (old-epoch callbacks are thereby ignored), and re-subscribe
  // to the replacement only when it has consumers (internal §7.4).
  function resetConnectionForReplacement() {
    unsubscribeConnection()
    connectionState.value = { ...DEFAULT_CONNECTION_STATE }
    if (connectionConsumers > 0) subscribeConnection()
  }

  // ---- onUpdate listener registry (proof prototype: handle.mjs) -------------
  function subscribeEntry(entry: OnUpdateEntry) {
    if (!primary) return
    const subscribedClient = primary
    const subscribedGeneration = currentIdentityGeneration
    const isCurrentSubscription = () =>
      entry.active &&
      primary === subscribedClient &&
      currentIdentityGeneration === subscribedGeneration
    entry.underlying = (
      subscribedClient.onUpdate as (
        q: unknown,
        a: unknown,
        cb: (r: unknown) => unknown,
        onErr?: (e: Error) => unknown,
      ) => ReturnType<ConvexClient['onUpdate']>
    )(
      entry.query,
      entry.args,
      (result) => {
        if (isCurrentSubscription()) return entry.callback(result)
      },
      (error) => {
        if (isCurrentSubscription()) return entry.onError?.(error)
      },
    )
  }
  function detachEntry(entry: OnUpdateEntry) {
    entry.underlying?.()
    entry.underlying = null
  }
  // Rebind every active listener A→B: detach from A first, swap `primary`, then
  // reattach on B — fully synchronous, before B is published to consumers.
  function rebindListeners(newClient: OwnedConvexClient) {
    for (const entry of listeners) detachEntry(entry)
    primary = newClient
    for (const entry of listeners) subscribeEntry(entry)
  }

  // ---- pending consumer-held call tracking (IDENTITY_CHANGED rejection) -----
  function rejectPendingForGeneration(generation: number) {
    for (const pending of [...pendingCalls]) {
      if (pending.generation === generation) {
        pendingCalls.delete(pending)
        pending.reject(createIdentityChangedError())
      }
    }
  }
  function rejectAllPending() {
    for (const pending of [...pendingCalls]) {
      pendingCalls.delete(pending)
      pending.reject(createIdentityChangedError())
    }
  }

  // Await any replacement already in progress and never dispatch to a superseded
  // client (vNext §5.4). Throws if no usable primary survives.
  async function primaryForDispatch(): Promise<OwnedConvexClient> {
    if (replacementInFlight) {
      try {
        await replacementInFlight
      } catch {
        // Replacement failure is surfaced by the null-primary check below.
      }
    }
    if (disposed || !primary) throw createIdentityChangedError()
    return primary
  }

  async function dispatch(
    method: 'query' | 'mutation' | 'action',
    fn: unknown,
    args: unknown,
    // The optional third argument (`mutation`'s optimistic-update option) is
    // forwarded verbatim to the current primary so routing through the handle
    // never silently drops it (vNext §5.4 handle stays behaviourally equal to
    // the raw client for the four supported operations).
    options?: unknown,
  ): Promise<unknown> {
    const client = await primaryForDispatch()
    const generation = currentIdentityGeneration
    let reject!: (reason: unknown) => void
    const aborted = new Promise<never>((_, r) => {
      reject = r
    })
    const pending: PendingCall = { generation, reject }
    pendingCalls.add(pending)

    // The underlying promise may never settle after `close()` (retired-client
    // hygiene); attach a no-op catch so a late rejection after we've raced away
    // via `aborted` never becomes an unhandled rejection.
    const underlying = (
      client[method] as (f: unknown, a: unknown, o?: unknown) => Promise<unknown>
    )(fn, args, options)
    underlying.catch(() => {})

    try {
      const result = await Promise.race([underlying, aborted])
      if (disposed || currentIdentityGeneration !== generation) {
        throw createIdentityChangedError(method)
      }
      return result
    } finally {
      pendingCalls.delete(pending)
    }
  }

  const handle: ConvexClientHandle = {
    query: ((fn: unknown, args: unknown) => dispatch('query', fn, args)) as ConvexClient['query'],
    mutation: ((fn: unknown, args: unknown, options?: unknown) =>
      dispatch('mutation', fn, args, options)) as ConvexClient['mutation'],
    action: ((fn: unknown, args: unknown) =>
      dispatch('action', fn, args)) as ConvexClient['action'],
    onUpdate: ((
      query: unknown,
      args: unknown,
      callback: (result: unknown) => unknown,
      onError?: (e: Error) => unknown,
    ) => {
      const entry: OnUpdateEntry = {
        query,
        args,
        callback,
        onError,
        underlying: null,
        active: true,
      }
      listeners.add(entry)
      subscribeEntry(entry)
      // Stable unsubscribe: closes over the registry entry (not a per-client
      // unsubscribe), so it detaches whichever client is current after A→B, and
      // preserves the augmented `Unsubscribe` shape (`unsubscribe`,
      // `getCurrentValue`).
      const stop = () => {
        if (!entry.active) return
        entry.active = false
        listeners.delete(entry)
        detachEntry(entry)
      }
      const unsubscribe = stop as ReturnType<ConvexClient['onUpdate']>
      unsubscribe.unsubscribe = stop
      unsubscribe.getCurrentValue = () => entry.underlying?.getCurrentValue()
      return unsubscribe
    }) as ConvexClient['onUpdate'],
  }

  function replacePrimary(replaceInput: ReplacePrimaryInput): Promise<OwnedConvexClient> {
    if (disposed) return Promise.reject(new Error('[client-owner] disposed'))

    const previous = primary
    const previousGeneration = currentIdentityGeneration
    const candidate = primaryFactory()
    replacementCandidates.add(candidate)

    // An identity transition is a security boundary. Retire the previous
    // principal before awaiting candidate confirmation; a failed confirmation
    // must leave no dispatchable client authenticated as the old user.
    for (const entry of listeners) detachEntry(entry)
    primary = null
    resetConnectionForReplacement()
    rejectPendingForGeneration(previousGeneration)
    if (previous) void previous.close()

    const run = (async () => {
      try {
        await Promise.race([replaceInput.initialize(candidate), disposedSignal])
        if (disposed) throw createIdentityChangedError()
      } catch (error) {
        // The candidate's WebSocket is already open at construction (§4.1); a
        // rejected/guard-failed confirmation must not leak it. Close before
        // rethrowing so the caller's error contract is unchanged.
        await closeReplacementCandidate(candidate)
        throw error
      }

      // Latest-revision-wins. No `await` between this guard and publication.
      if (disposed || !replaceInput.isCurrent()) {
        await closeReplacementCandidate(candidate)
        throw createIdentityChangedError()
      }

      // Synchronous commit region: rebind listeners A→B (detach-swap-reattach,
      // which also reassigns `primary`), then publish the new generation, reset
      // connection observation, retire A's in-flight calls, and close A.
      currentIdentityGeneration = replaceInput.identityGeneration
      rebindListeners(candidate)
      resetConnectionForReplacement()
      devtoolsSink?.clearIdentityOwned()
      rejectPendingForGeneration(previousGeneration)
      return candidate
    })().finally(() => {
      replacementCandidates.delete(candidate)
    })

    replacementInFlight = run
    void run
      .catch(() => {})
      .finally(() => {
        if (replacementInFlight === run) replacementInFlight = null
      })
    return run
  }

  function attachAuthPort(port: AuthIdentityPort): void {
    let committedGeneration = port.snapshot().identityGeneration
    let inFlightGeneration: number | null = null
    const unsubscribe = port.subscribe(() => {
      const snapshot = port.snapshot()
      // Only a stable identity-key change replaces the primary. An epoch-only
      // change (same-user token rotation) keeps the current client (vNext §5.4).
      if (
        snapshot.identityGeneration === committedGeneration ||
        snapshot.identityGeneration === inFlightGeneration
      ) {
        return
      }
      const targetGeneration = snapshot.identityGeneration
      inFlightGeneration = targetGeneration
      void replacePrimary({
        identity: snapshot.identityKey ?? 'anonymous',
        authEpoch: snapshot.authEpoch,
        identityGeneration: targetGeneration,
        isCurrent: () => port.snapshot().identityGeneration === targetGeneration,
        initialize: (candidate) =>
          port.initializePrimary(candidate as ConvexClient, snapshot.authEpoch),
      })
        .then(() => {
          committedGeneration = targetGeneration
        })
        .catch((error) => {
          port.failPrimary(targetGeneration, error)
        })
        .finally(() => {
          if (inFlightGeneration === targetGeneration) inFlightGeneration = null
        })
    })
    addDisposer(unsubscribe)
  }

  function getAnonymous(): OwnedConvexClient {
    if (disposed) throw new Error('[client-owner] disposed')
    if (anonymousFactory) {
      if (!anonymous) anonymous = anonymousFactory()
      return anonymous
    }
    // Auth-disabled build: the primary is permanently anonymous, so reuse it.
    if (!primary) throw createIdentityChangedError()
    return primary
  }

  function addDisposer(dispose: () => void): void {
    // A disposer registered after teardown began runs immediately (§4.2).
    if (disposed) {
      try {
        dispose()
      } catch {
        // Late-cleanup errors are swallowed so they never block other teardown.
      }
      return
    }
    disposers.add(dispose)
  }

  function attachDevtoolsSink(sink: DevtoolsSink): (() => void) | null {
    if (disposed) {
      sink.dispose()
      return null
    }
    devtoolsSink?.dispose()
    devtoolsSink = sink
    return () => {
      if (devtoolsSink !== sink) return
      devtoolsSink = null
      sink.dispose()
    }
  }

  function dispose(): Promise<void> {
    if (disposePromise) return disposePromise
    disposed = true // marked before the first await so no late attach mutates state
    resolveDisposed()
    disposePromise = (async () => {
      for (const d of [...disposers]) {
        try {
          d()
        } catch {
          // collect-and-continue
        }
      }
      disposers.clear()
      unsubscribeConnection()
      for (const entry of [...listeners]) {
        entry.active = false
        detachEntry(entry)
      }
      listeners.clear()
      rejectAllPending()
      devtoolsSink?.dispose()
      devtoolsSink = null
      // Candidate confirmation is controlled by an external auth client and may
      // never settle. Closing all allocated candidates is the cancellation
      // boundary; disposal itself must remain bounded.
      await Promise.allSettled([...replacementCandidates].map(closeReplacementCandidate))
      replacementCandidates.clear()
      const clients = new Set<OwnedConvexClient>()
      if (primary) clients.add(primary)
      if (anonymous) clients.add(anonymous)
      await Promise.allSettled([...clients].map((client) => client.close()))
      primary = null
      anonymous = null
    })()
    return disposePromise
  }

  return {
    handle,
    logger,
    getPrimary() {
      if (!primary) return null
      return { client: primary, identityGeneration: currentIdentityGeneration }
    },
    getAnonymous,
    replacePrimary,
    attachAuthPort,
    connection: {
      state: readonly(connectionState) as Readonly<Ref<ConnectionState>>,
      addConsumer() {
        connectionConsumers += 1
        if (connectionConsumers === 1) subscribeConnection()
        let removed = false
        return () => {
          if (removed) return
          removed = true
          connectionConsumers -= 1
          if (connectionConsumers === 0) unsubscribeConnection()
        }
      },
    },
    addDisposer,
    getDevtoolsSink: () => devtoolsSink,
    attachDevtoolsSink,
    dispose,
  }
}
