import type { AuthTokenFetcher, ConvexClient } from 'convex/browser'

import { ConvexCallError } from '../errors'
import type { ClientIdentityPort, ClientIdentitySnapshot } from './identity-port'

export type BrowserAuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error'

/** Provider-neutral browser identity snapshot. It contains no credential or client control. */
export interface BrowserAuthSnapshot {
  readonly status: BrowserAuthStatus
  /** Stable, non-secret provider subject used only for local state isolation. */
  readonly identityKey: string | null
  /** Non-secret monotonic credential lifecycle owned by the provider adapter. */
  readonly sessionGeneration: number
  readonly error: Error | null
}

/** Provider-neutral auth adapter. It deliberately contains no client controls. */
export interface BrowserAuthAdapter {
  snapshot(): BrowserAuthSnapshot
  subscribe(listener: () => void): () => void
  fetchToken: AuthTokenFetcher
}

interface AuthCapableClient extends ConvexClient {
  setAuth(
    fetchToken: AuthTokenFetcher,
    onChange: (isAuthenticated: boolean) => void,
    onRefreshChange?: (isRefreshing: boolean) => void,
  ): void
  clearAuth(): void
}

export interface AuthAdapterIdentityPort extends ClientIdentityPort {
  refresh(): Promise<void>
  dispose(): void
}

const CONFIRMATION_TIMEOUT_MS = 10_000

function validateSnapshot(snapshot: BrowserAuthSnapshot): BrowserAuthSnapshot {
  if (!Number.isSafeInteger(snapshot.sessionGeneration) || snapshot.sessionGeneration < 0) {
    throw new TypeError('Auth adapter sessionGeneration must be a non-negative safe integer.')
  }
  if (snapshot.status === 'authenticated') {
    if (typeof snapshot.identityKey !== 'string' || snapshot.identityKey.length === 0) {
      throw new TypeError(
        'An authenticated auth adapter snapshot requires a non-empty identityKey.',
      )
    }
  } else if (snapshot.identityKey !== null) {
    throw new TypeError(
      'A non-authenticated auth adapter snapshot cannot carry a user identityKey.',
    )
  }
  if (snapshot.status === 'error' && !(snapshot.error instanceof Error)) {
    throw new TypeError('An error auth adapter snapshot requires an Error.')
  }
  return snapshot
}

function clientIdentityKey(snapshot: BrowserAuthSnapshot): ClientIdentitySnapshot['identityKey'] {
  return snapshot.status === 'authenticated' ? `user:${snapshot.identityKey}` : 'anonymous'
}

function publicError(snapshot: BrowserAuthSnapshot): ConvexCallError | null {
  if (snapshot.status !== 'error') return null
  return new ConvexCallError({
    kind: 'authentication',
    message: 'Authentication failed',
    cause: snapshot.error,
  })
}

/**
 * Translates provider state into the shared
 * token-free identity port while retaining ownership of `setAuth` and raw clients.
 */
export function createAuthAdapterIdentityPort(
  adapter: BrowserAuthAdapter,
): AuthAdapterIdentityPort {
  let desired = validateSnapshot(adapter.snapshot())
  let authEpoch = 0
  let identityGeneration = 0
  let disposed = false
  let currentClient: AuthCapableClient | null = null
  let currentClientGeneration = -1
  const activeAuthConfiguration = new WeakMap<AuthCapableClient, object>()
  let initialSettled = desired.status !== 'loading' && desired.status !== 'authenticated'
  let snapshot: ClientIdentitySnapshot = {
    authEnabled: true,
    settled: initialSettled,
    identityKey: clientIdentityKey(desired),
    authEpoch,
    identityGeneration,
    error: publicError(desired),
  }
  const listeners = new Set<() => void>()
  const settlementWaiters = new Set<() => void>()
  const activeConfirmations = new Set<(error: ConvexCallError) => void>()

  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // Consumer observation must not change authentication state.
      }
    }
  }
  const resolveSettlement = () => {
    if (!snapshot.settled) return
    initialSettled = true
    for (const resolve of [...settlementWaiters]) resolve()
    settlementWaiters.clear()
  }
  const publish = (next: ClientIdentitySnapshot) => {
    snapshot = Object.freeze(next)
    resolveSettlement()
    notify()
  }

  const failClosed = (failedGeneration: number, cause: unknown) => {
    if (disposed || failedGeneration !== identityGeneration) return
    authEpoch += 1
    identityGeneration += 1
    currentClient = null
    currentClientGeneration = -1
    desired = {
      status: 'error',
      identityKey: null,
      sessionGeneration: desired.sessionGeneration + 1,
      error: cause instanceof Error ? cause : new Error('Convex authentication failed'),
    }
    publish({
      authEnabled: true,
      settled: true,
      identityKey: 'anonymous',
      authEpoch,
      identityGeneration,
      error: publicError(desired),
    })
  }

  const confirm = (client: AuthCapableClient, expectedGeneration: number): Promise<void> => {
    const superseded = new ConvexCallError({
      kind: 'authentication',
      code: 'IDENTITY_CHANGED',
      message: 'Identity changed while authenticating',
    })
    for (const cancel of [...activeConfirmations]) cancel(superseded)
    const configuration = {}
    activeAuthConfiguration.set(client, configuration)
    return new Promise<void>((resolve, reject) => {
      let done = false
      const finish = (error?: ConvexCallError) => {
        if (done) return
        done = true
        clearTimeout(timer)
        activeConfirmations.delete(finish)
        if (error) reject(error)
        else resolve()
      }
      activeConfirmations.add(finish)
      const timer = setTimeout(
        () =>
          finish(
            new ConvexCallError({
              kind: 'authentication',
              code: 'AUTH_CONFIRMATION_TIMEOUT',
              message: 'Convex authentication confirmation timed out',
            }),
          ),
        CONFIRMATION_TIMEOUT_MS,
      )
      try {
        client.setAuth(adapter.fetchToken, (authenticated) => {
          if (
            disposed ||
            expectedGeneration !== identityGeneration ||
            client !== currentClient ||
            activeAuthConfiguration.get(client) !== configuration
          ) {
            finish(
              new ConvexCallError({
                kind: 'authentication',
                code: 'IDENTITY_CHANGED',
                message: 'Identity changed while authenticating',
              }),
            )
            return
          }
          if (!authenticated) {
            const rejection = new ConvexCallError({
              kind: 'authentication',
              message: 'Convex rejected the authentication token',
            })
            if (done) failClosed(expectedGeneration, rejection)
            else finish(rejection)
            return
          }
          publish({ ...snapshot, settled: true, error: null })
          finish()
        })
      } catch (cause) {
        finish(
          new ConvexCallError({
            kind: 'authentication',
            message: 'Convex authentication setup failed',
            cause,
          }),
        )
      }
    })
  }

  const transition = (nextValue: BrowserAuthSnapshot) => {
    const next = validateSnapshot(nextValue)
    const previous = desired
    desired = next
    authEpoch += 1
    const crossedIdentity =
      previous.status !== next.status ||
      previous.identityKey !== next.identityKey ||
      previous.sessionGeneration !== next.sessionGeneration

    if (crossedIdentity) {
      const retired = new ConvexCallError({
        kind: 'authentication',
        code: 'IDENTITY_CHANGED',
        message: 'Identity changed while authenticating',
      })
      for (const cancel of [...activeConfirmations]) cancel(retired)
      identityGeneration += 1
      currentClient = null
      currentClientGeneration = -1
      publish({
        authEnabled: true,
        settled: next.status === 'anonymous' || next.status === 'error',
        identityKey: clientIdentityKey(next),
        authEpoch,
        identityGeneration,
        error: publicError(next),
      })
      return
    }

    // A same-session provider notification is a token-refresh hint. Keep the
    // identity generation and ask Convex to refetch through the owned client.
    const wasSettled = snapshot.settled
    publish({ ...snapshot, authEpoch, error: publicError(next) })
    if (wasSettled && next.status === 'authenticated' && currentClient) {
      void confirm(currentClient, currentClientGeneration).catch(() => {})
    }
  }

  const unsubscribeAdapter = adapter.subscribe(() => {
    if (disposed) return
    try {
      transition(adapter.snapshot())
    } catch (cause) {
      transition({
        status: 'error',
        identityKey: null,
        sessionGeneration: desired.sessionGeneration + 1,
        error: cause instanceof Error ? cause : new Error('Invalid auth adapter state'),
      })
    }
  })

  return Object.freeze({
    snapshot: () => snapshot,
    waitForInitialSettlement: () => {
      if (initialSettled || snapshot.settled) return Promise.resolve()
      return new Promise<void>((resolve) => settlementWaiters.add(resolve))
    },
    subscribe(listener: () => void) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async initializePrimary(candidate: ConvexClient) {
      if (disposed) throw new Error('Auth adapter identity port is disposed.')
      const client = candidate as AuthCapableClient
      const generation = identityGeneration
      currentClient = client
      currentClientGeneration = generation
      if (desired.status !== 'authenticated') {
        client.clearAuth()
        publish({ ...snapshot, settled: true })
        return
      }
      await confirm(client, generation)
    },
    failPrimary(failedGeneration: number, cause: unknown) {
      failClosed(failedGeneration, cause)
    },
    async refresh() {
      if (disposed || desired.status !== 'authenticated' || !currentClient) return
      await confirm(currentClient, currentClientGeneration)
    },
    dispose() {
      if (disposed) return
      disposed = true
      const cancellation = new ConvexCallError({
        kind: 'authentication',
        code: 'IDENTITY_CHANGED',
        message: 'Authentication runtime was disposed',
      })
      for (const cancel of [...activeConfirmations]) cancel(cancellation)
      unsubscribeAdapter()
      listeners.clear()
      snapshot = Object.freeze({ ...snapshot, settled: true })
      resolveSettlement()
      currentClient = null
    },
  })
}
