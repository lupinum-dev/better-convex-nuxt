import type { ConvexClient } from 'convex/browser'
import { computed } from 'vue'

import { createIdentityChangedError } from '../client-core/identity-changed-error'
import type { ClientIdentityPort, ClientIdentitySnapshot } from '../client-core/identity-port'
import { ConvexCallError } from '../errors'
import { deriveConvexAuthStatus, type ConvexAuthStatus } from '../utils/auth-status'
import { getConvexIdentityKey, type ConvexIdentityKey } from '../utils/identity-key'
import type { Logger } from '../utils/logger'
import type { ConvexUser } from '../utils/types'
import {
  ANONYMOUS_IDENTITY,
  identityKeyOf,
  identityToken,
  identityUser,
  toAuthenticatedIdentity,
  type AuthIdentity,
} from './auth-identity'
import type {
  AuthClientWithConvex,
  ConvexAuthCoordinator,
  ConvexAuthCoordinatorState,
} from './client-engine-types'
import { createIntegratedAuthNamespace } from './integrated-namespace'
import { createPendingOperations } from './pending-operations'
import { createSerialQueue } from './serial-queue'
import { createSessionSynchronization } from './session-synchronization'
import { fetchConvexToken, isTokenUsable, RETRY_BACKOFF_MS } from './token-fetcher'

export type {
  AuthClientWithConvex,
  ConvexAuthCoordinator,
  ConvexAuthCoordinatorState,
} from './client-engine-types'

/**
 * Total budget for Convex to fetch a token and confirm it on the transport.
 * The token fetcher owns a five-second inner deadline, so this outer boundary
 * must leave time for the subsequent WebSocket authentication round trip.
 */
const AUTH_CONFIRMATION_TIMEOUT_MS = 10_000
/** Bound for a successful auth action to produce a public session revision. */
const SESSION_RECONCILIATION_TIMEOUT_MS = 5_000

interface VoidDeferred {
  promise: Promise<void>
  resolve: () => void
}

function createDeferred(): VoidDeferred {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

export function createConvexAuthCoordinator(input: {
  authClient: AuthClientWithConvex | null
  state: ConvexAuthCoordinatorState
  /** Purge identity-owned SSR payloads on a stable identity-key change. */
  purgeIdentityPayloads?: () => void
  logger?: Pick<Logger, 'auth'>
}): ConvexAuthCoordinator {
  const { authClient, state } = input
  const purgeIdentityPayloads = input.purgeIdentityPayloads ?? (() => {})
  const logAuth = input.logger?.auth ?? (() => {})

  // ---- counters (architecture invariant) --------------------------------------------
  let authEpoch = 0
  let identityGeneration = 0

  // ---- published identity + staged candidate -------------------------------
  let settled = false
  // The private candidate served by `setAuth`; published only after confirmation.
  let stagedToken: string | null = null
  let stagedUser: ConvexUser | null = null
  let stagedKey: ConvexIdentityKey = 'anonymous'

  // ---- current primary + confirmation handshakes ---------------------------
  let currentClient: ConvexClient | null = null
  const pendingConfirmations = new Map<number, VoidDeferred>()
  const activeConfirmationCancellations = new Set<() => void>()
  const pendingConfirmationByClient = new WeakMap<ConvexClient, () => void>()
  const activeAuthConfiguration = new WeakMap<ConvexClient, object>()

  // ---- initial settlement + refresh dedup ----------------------------------
  const initialSettlement = createDeferred()
  let refreshPromise: Promise<void> | null = null
  let refreshEpoch = -1

  // ---- retry (coalesced) ---------------------------------------------------
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryIndex = 0

  // ---- port fan-out --------------------------------------------------------
  const listeners = new Set<() => void>()
  const settlementWaiters = new Set<() => void>()
  let disposed = false
  let resolveDisposal!: () => void
  const disposalController = new AbortController()
  const disposalSignal = new Promise<void>((resolve) => {
    resolveDisposal = resolve
  })

  const pending = createPendingOperations()
  const queue = createSerialQueue()

  const notify = () => {
    for (const listener of [...listeners]) listener()
  }

  const resolveSettlementWaiters = () => {
    for (const resolve of [...settlementWaiters]) resolve()
    settlementWaiters.clear()
  }

  // ---- public reactive surface ---------------------------------------------
  const status = computed<ConvexAuthStatus>(() =>
    deriveConvexAuthStatus({
      authEnabled: true,
      settled: !state.pending.value,
      identityKey: identityKeyOf(state.identity.value),
      error: state.authError.value
        ? new ConvexCallError({
            kind: 'authentication',
            message: state.authError.value,
          })
        : null,
    }),
  )
  const token = computed(() => identityToken(state.identity.value))
  const user = computed(() => identityUser(state.identity.value))
  const isAuthenticated = computed(() => state.identity.value.status === 'authenticated')
  const error = computed<ConvexCallError | null>(() =>
    state.authError.value
      ? new ConvexCallError({
          kind: 'authentication',
          message: state.authError.value,
        })
      : null,
  )

  // ---- publish helpers -----------------------------------------------------
  function markSettled() {
    if (settled) return
    settled = true
    state.pending.value = false
    initialSettlement.resolve()
  }

  function publishAuthenticated(token: string, user: ConvexUser) {
    const nextIdentity = toAuthenticatedIdentity(token, user)
    if (nextIdentity.status === 'authenticated') {
      state.identity.value = nextIdentity
      state.authError.value = null
    } else {
      // A token without a usable user id is not a settled identity.
      publishAnonymous(null)
      return
    }
    markSettled()
    resolveSettlementWaiters()
    notify()
  }

  function publishAnonymous(errorMessage: string | null) {
    state.identity.value = ANONYMOUS_IDENTITY
    stagedToken = null
    stagedUser = null
    stagedKey = 'anonymous'
    state.authError.value = errorMessage
    markSettled()
    resolveSettlementWaiters()
    notify()
  }

  // ---- setAuth token fetcher (TOTAL — never rejects) -----------------------
  function makeSetAuthFetcher(epoch: number) {
    return async ({
      forceRefreshToken,
    }: {
      forceRefreshToken: boolean
    }): Promise<string | null> => {
      if (disposed || epoch !== authEpoch) {
        // A retired A configuration must never borrow the globally staged B.
        return null
      }
      if (!forceRefreshToken && isTokenUsable(stagedToken)) return stagedToken
      if (!authClient) return isTokenUsable(stagedToken) ? stagedToken : null

      const outcome = await fetchConvexToken(authClient, {
        signal: disposalController.signal,
      })
      if (disposed || epoch !== authEpoch) {
        // The exchange may have settled after an identity transition.
        return null
      }
      if (outcome.identity) {
        const nextKey = safeIdentityKey(outcome.identity.user)
        if (!settled || (nextKey === stagedKey && nextKey !== 'anonymous')) {
          // Initial settlement establishes the first identity; after settlement
          // only a same-user token rotation may be applied in place here.
          stagedToken = outcome.identity.token
          stagedUser = outcome.identity.user
          stagedKey = nextKey
          clearRetry()
          return stagedToken
        }
        // An identity-KEY change after settlement cannot be applied from inside
        // setAuth; keep the usable token and let a queued/refresh op drive it.
        return isTokenUsable(stagedToken) ? stagedToken : null
      }
      // A definitive no-session/invalid-token verdict revokes the cached
      // credential immediately. Only a transient failure may retain a token
      // that is still inside its usable lifetime.
      if (outcome.definitive) {
        state.authError.value = outcome.authError
        clearRetry()
        return null
      }
      if (isTokenUsable(stagedToken)) {
        scheduleRetry(epoch)
        return stagedToken
      }
      return null
    }
  }

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    retryIndex = 0
  }

  function scheduleRetry(epoch: number) {
    if (retryTimer || disposed) return
    const delay = RETRY_BACKOFF_MS[Math.min(retryIndex, RETRY_BACKOFF_MS.length - 1)]
    retryTimer = setTimeout(() => {
      retryTimer = null
      retryIndex += 1
      if (disposed || epoch !== authEpoch || !currentClient) return
      if (!isTokenUsable(stagedToken)) return
      // Re-invoke setAuth to force Convex to re-fetch (the pinned client does not
      // re-fetch on an unchanged token). Confirmation callbacks publish as usual.
      void confirmCurrentClient(currentClient, epoch)
    }, delay)
  }

  // ---- confirmation ordering -----------------------------------------------
  async function transitionConfirmedClientToAnonymous(
    client: ConvexClient,
    expectedEpoch: number,
    errorMessage: string | null,
  ): Promise<void> {
    if (disposed || expectedEpoch !== authEpoch || currentClient !== client) return

    // Invalidate this long-lived callback before advancing the epoch. A queued
    // duplicate from the retired configuration can no longer start a second
    // anonymous transition.
    activeAuthConfiguration.set(client, {})
    const epoch = (authEpoch += 1)
    clearRetry()
    state.authError.value = errorMessage
    try {
      await commitTransition(ANONYMOUS_IDENTITY, epoch)
    } catch {
      if (disposed || epoch !== authEpoch) return
      // `commitTransition` has already advanced the generation and purged
      // identity-owned state before notifying the owner. If an internal
      // listener itself throws, the Convex client has still rejected/cleared
      // auth, so publish the same fail-closed state without leaking the throw.
      publishAnonymous(errorMessage)
    }
  }

  function installSetAuth(client: ConvexClient, epoch: number, gen: number | null): Promise<void> {
    // A newer setAuth call on the same client supersedes any first-confirmation
    // wait still in flight. Its configuration token below also makes queued
    // callbacks from the older call inert.
    pendingConfirmationByClient.get(client)?.()
    const configuration = {}
    activeAuthConfiguration.set(client, configuration)

    return new Promise<void>((resolve, reject) => {
      let confirmationObserved = false
      let promiseSettled = false
      let timer: ReturnType<typeof setTimeout> | null = null

      const stopTimer = () => {
        if (timer !== null) clearTimeout(timer)
        timer = null
      }
      const cleanupPromise = () => {
        stopTimer()
        activeConfirmationCancellations.delete(cancel)
        if (pendingConfirmationByClient.get(client) === cancel) {
          pendingConfirmationByClient.delete(client)
        }
      }
      const settleResolve = () => {
        if (promiseSettled) return
        promiseSettled = true
        cleanupPromise()
        resolve()
      }
      const settleReject = (failure: ConvexCallError) => {
        if (promiseSettled) return
        promiseSettled = true
        cleanupPromise()
        reject(failure)
      }
      const cancel = () => {
        settleResolve()
      }

      activeConfirmationCancellations.add(cancel)
      pendingConfirmationByClient.set(client, cancel)
      timer = setTimeout(() => {
        if (promiseSettled || confirmationObserved) return
        if (
          disposed ||
          epoch !== authEpoch ||
          activeAuthConfiguration.get(client) !== configuration
        ) {
          if (gen !== null) resolveConfirmation(gen)
          settleResolve()
          return
        }

        // Supersede the indefinite Convex auth configuration with a total
        // anonymous fetcher. This resumes its paused auth lifecycle without
        // trusting a token whose server transition was never confirmed.
        activeAuthConfiguration.set(client, {})
        try {
          client.setAuth(
            async () => null,
            () => {},
          )
        } catch {
          // The owner closes replacement candidates; the initial/current path
          // publishes a fail-closed error below. Never mask the timeout itself.
        }
        settleReject(
          new ConvexCallError({
            kind: 'authentication',
            code: 'AUTH_CONFIRMATION_TIMEOUT',
            message: 'Convex authentication confirmation timed out',
          }),
        )
      }, AUTH_CONFIRMATION_TIMEOUT_MS)

      try {
        client.setAuth(makeSetAuthFetcher(epoch), (isAuthenticated) => {
          if (
            disposed ||
            epoch !== authEpoch ||
            activeAuthConfiguration.get(client) !== configuration
          ) {
            return
          }

          if (!confirmationObserved) {
            confirmationObserved = true
            stopTimer()
            if (!isAuthenticated) {
              // The first server result definitively rejected this token. A
              // private replacement has already crossed the generation
              // boundary, so it can publish as the now-anonymous candidate.
              // An initial/current client must perform that boundary now.
              activeAuthConfiguration.set(client, {})
              if (gen !== null) {
                publishAnonymous(state.authError.value)
                resolveConfirmation(gen)
                settleResolve()
              } else if (state.identity.value.status === 'authenticated') {
                void transitionConfirmedClientToAnonymous(
                  client,
                  epoch,
                  state.authError.value,
                ).then(settleResolve)
              } else {
                publishAnonymous(state.authError.value)
                settleResolve()
              }
              return
            }

            if (stagedKey !== 'anonymous' && stagedToken && stagedUser) {
              publishAuthenticated(stagedToken, stagedUser)
            } else {
              publishAnonymous(null)
            }
            if (gen !== null) resolveConfirmation(gen)
            settleResolve()
            return
          }

          if (isAuthenticated) {
            // Convex normally reports `true` only for the first transition, but
            // treating a duplicate as an idempotent same-identity publication
            // keeps a refreshed staged token coherent without re-opening the
            // one-shot confirmation promise.
            if (stagedKey !== 'anonymous' && stagedToken && stagedUser) {
              publishAuthenticated(stagedToken, stagedUser)
            }
            return
          }

          // The callback intentionally outlives first confirmation: Convex uses
          // this same function to report later scheduled-refresh revocation.
          void transitionConfirmedClientToAnonymous(client, epoch, state.authError.value)
        })
      } catch (cause) {
        if (activeAuthConfiguration.get(client) === configuration) {
          activeAuthConfiguration.set(client, {})
        }
        settleReject(
          new ConvexCallError({
            kind: 'authentication',
            code: 'AUTH_CONFIRMATION_FAILED',
            message: 'Convex authentication could not be initialized',
            cause,
          }),
        )
      }
    })
  }

  async function confirmCurrentClient(client: ConvexClient, epoch: number): Promise<void> {
    try {
      await installSetAuth(client, epoch, null)
    } catch (failure) {
      if (disposed || epoch !== authEpoch || currentClient !== client) return
      const message =
        failure instanceof Error
          ? failure.message
          : 'Convex authentication could not be initialized'
      if (state.identity.value.status === 'authenticated') {
        await transitionConfirmedClientToAnonymous(client, epoch, message)
        return
      }
      publishAnonymous(message)
    }
  }

  function resolveConfirmation(gen: number) {
    const deferred = pendingConfirmations.get(gen)
    if (deferred) {
      pendingConfirmations.delete(gen)
      deferred.resolve()
    }
  }

  function supersedeCrossedGeneration(): boolean {
    if (pendingConfirmations.size === 0) return false

    // The prior principal was already retired for this generation, so a newer
    // revision cannot use the published identity's same-key in-place path. Make
    // the private candidate inert, release its initializer, and force a fresh
    // generation for the latest target below.
    if (currentClient) {
      activeAuthConfiguration.set(currentClient, {})
      pendingConfirmationByClient.get(currentClient)?.()
    }
    for (const confirmation of pendingConfirmations.values()) confirmation.resolve()
    pendingConfirmations.clear()
    return true
  }

  // ---- core transition (post-settlement) -----------------------------------
  async function commitTransition(target: AuthIdentity, epoch: number): Promise<void> {
    if (disposed || epoch !== authEpoch) return
    const crossedGeneration = supersedeCrossedGeneration()
    const targetKey = identityKeyOf(target)
    const currentKey = identityKeyOf(state.identity.value)

    // Stage the candidate the fetcher / owner will confirm.
    if (target.status === 'authenticated') {
      stagedToken = target.token
      stagedUser = target.user
      stagedKey = target.key
    } else {
      stagedToken = null
      stagedUser = null
      stagedKey = 'anonymous'
    }

    if (targetKey === currentKey && !crossedGeneration) {
      // Same identity key. Anonymous→anonymous publishes directly; same-user
      // token rotation re-confirms the token on the CURRENT client in place.
      if (target.status === 'authenticated' && currentClient) {
        await confirmCurrentClient(currentClient, epoch)
      } else {
        publishAnonymous(state.authError.value)
      }
      return
    }

    // Stable identity-key change between two settled identities: retire the prior
    // primary through the owner. Purge identity-owned payloads synchronously, bump
    // identityGeneration, notify the owner (it replaces and calls
    // initializePrimary), and await the confirmation the owner's handshake drives.
    purgeIdentityPayloads()
    const gen = (identityGeneration += 1)
    const confirmation = createDeferred()
    pendingConfirmations.set(gen, confirmation)
    notify()
    await confirmation.promise
  }

  // ---- integrated operation scheduling -------------------------------------
  function executeIntegratedOperation(operation: () => Promise<unknown>): Promise<unknown> {
    return pending.run(() =>
      queue.enqueue(async () => {
        if (disposed) throw createIdentityChangedError('authentication operation')
        const underlying = operation()
        // The Better Auth call may not support cancellation. Its late settlement
        // is abandoned after teardown and must never become unhandled.
        underlying.catch(() => {})
        return await Promise.race([
          underlying,
          disposalSignal.then(() => {
            throw createIdentityChangedError('authentication operation')
          }),
        ])
      }),
    )
  }

  async function failClosedSessionSynchronization(failure: ConvexCallError): Promise<void> {
    if (disposed) return
    const epoch = (authEpoch += 1)
    clearRetry()
    state.authError.value = failure.message
    await commitTransition(ANONYMOUS_IDENTITY, epoch)
  }

  const sessionSynchronization = createSessionSynchronization({
    timeoutMs: SESSION_RECONCILIATION_TIMEOUT_MS,
    isDisposed: () => disposed,
    failClosed: failClosedSessionSynchronization,
  })

  async function reconcileSession(
    sessionToken: string | null,
    errorMessage: string | null = null,
  ): Promise<void> {
    if (disposed) return
    const sessionPresent = sessionToken !== null
    const revision = sessionSynchronization.advance()
    const epoch = (authEpoch += 1)
    clearRetry()
    try {
      if (!sessionPresent || errorMessage) {
        state.authError.value = errorMessage
        await commitTransition(ANONYMOUS_IDENTITY, epoch)
        return
      }
      await pending.run(async () => {
        if (!authClient) return
        const outcome = await fetchConvexToken(authClient, {
          signal: disposalController.signal,
        })
        if (disposed || !sessionSynchronization.isCurrent(revision) || epoch !== authEpoch) return
        if (outcome.identity) {
          await commitTransition(
            toAuthenticatedIdentity(outcome.identity.token, outcome.identity.user),
            epoch,
          )
        } else {
          state.authError.value = outcome.authError
          await commitTransition(ANONYMOUS_IDENTITY, epoch)
        }
      })
    } finally {
      // An errored observation is not evidence of either the reported stale
      // session token or canonical absence. Do not let it satisfy sign-in or
      // sign-out correlation; the bounded wrapper will fail closed instead.
      if (errorMessage === null) sessionSynchronization.complete(revision, sessionToken)
    }
  }

  // ---- background refresh (epoch-scoped dedup) -----------------------------
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve()
    // Deduplicate per authEpoch: a caller holding a newer epoch starts a fresh
    // refresh instead of awaiting a stale one (decision 3).
    if (refreshPromise && refreshEpoch === authEpoch) return refreshPromise

    const epoch = authEpoch
    refreshEpoch = epoch
    refreshPromise = pending
      .run(async () => {
        const source = authClient
        if (!source) return
        const outcome = await fetchConvexToken(source, {
          signal: disposalController.signal,
        })
        // Commit only while the captured epoch remains current (cannot commit
        // across authEpoch).
        if (disposed || epoch !== authEpoch) return
        if (outcome.identity) {
          const target = toAuthenticatedIdentity(outcome.identity.token, outcome.identity.user)
          const targetKey = identityKeyOf(target)
          if (targetKey === identityKeyOf(state.identity.value) && targetKey !== 'anonymous') {
            // Same-user rotation: authEpoch advances, identityGeneration does not.
            authEpoch += 1
            stagedToken = target.status === 'authenticated' ? target.token : null
            stagedUser = target.status === 'authenticated' ? target.user : null
            if (target.status === 'authenticated' && currentClient) {
              await confirmCurrentClient(currentClient, authEpoch)
            }
          } else {
            authEpoch += 1
            await commitTransition(target, authEpoch)
          }
        } else if (outcome.authError) {
          if (
            state.identity.value.status === 'authenticated' &&
            isTokenUsable(stagedToken) &&
            !outcome.definitive
          ) {
            // Transient failure over a usable identity: keep it, record error.
            state.authError.value = outcome.authError
            notify()
          } else {
            // Definitive credential rejection or no usable identity: retire the
            // prior identity and preserve the authentication error.
            state.authError.value = outcome.authError
            authEpoch += 1
            await commitTransition(ANONYMOUS_IDENTITY, authEpoch)
          }
        } else if (state.identity.value.status === 'authenticated' || state.authError.value) {
          // Clean anonymous outcome (no session, no error). If a still-usable
          // identity or a stale error was previously published, clear it — this
          // is the required `authenticated -> anonymous` and `error -> anonymous`
          // background-refresh transitions . Clear the stale error
          // BEFORE the same-identity-key anonymous->anonymous publish path
          // (which otherwise republishes whatever `state.authError` still holds).
          state.authError.value = null
          authEpoch += 1
          await commitTransition(ANONYMOUS_IDENTITY, authEpoch)
        }
      })
      .finally(() => {
        if (refreshEpoch === epoch) {
          refreshPromise = null
        }
      })
    return refreshPromise
  }

  // ---- sign-out (identity-queue op) ----------------------------------------
  async function recoverFailedSignOut(epoch: number, message: string): Promise<void> {
    if (disposed || epoch !== authEpoch) return

    // A failed Better Auth response does not prove that the session cookie was
    // preserved. Validate it once before re-arming the newer epoch; otherwise a
    // partially completed logout could keep serving the old cached JWT.
    const outcome = authClient
      ? await fetchConvexToken(authClient, { signal: disposalController.signal })
      : null
    if (disposed || epoch !== authEpoch) return

    let retainCurrentIdentity = false
    if (state.identity.value.status === 'authenticated' && outcome?.identity) {
      const nextKey = safeIdentityKey(outcome.identity.user)
      if (nextKey === state.identity.value.key) {
        stagedToken = outcome.identity.token
        stagedUser = outcome.identity.user
        stagedKey = nextKey
        retainCurrentIdentity = true
      }
    } else if (
      state.identity.value.status === 'authenticated' &&
      outcome !== null &&
      !outcome.definitive &&
      isTokenUsable(stagedToken)
    ) {
      // A transient validation failure does not revoke a still-usable token.
      retainCurrentIdentity = true
    }

    if (retainCurrentIdentity && currentClient) {
      await confirmCurrentClient(currentClient, epoch)
    } else if (state.identity.value.status === 'authenticated') {
      state.authError.value = message
      await commitTransition(ANONYMOUS_IDENTITY, epoch)
    }

    if (!disposed && epoch === authEpoch && state.identity.value.status === 'authenticated') {
      state.authError.value = message
      notify()
    }
  }

  function signOut(): Promise<unknown> {
    return executeIntegratedOperation(async () => {
      if (!authClient) {
        const message = '[useConvexAuth] Cannot sign out because Better Auth client is unavailable'
        state.authError.value = message
        throw new Error(message)
      }
      // Advance authEpoch AT DEQUEUE, before awaiting Better Auth (decision 3).
      const epoch = (authEpoch += 1)
      clearRetry()
      const barrier = sessionSynchronization.createBarrier()
      let result: unknown
      try {
        result = await authClient.signOut()
      } catch (error) {
        barrier.cancel()
        await recoverFailedSignOut(epoch, normalizeError(error, 'Sign out failed'))
        throw error
      }
      const maybeError =
        result && typeof result === 'object' && 'error' in result
          ? (result as { error?: unknown }).error
          : null
      if (maybeError) {
        barrier.cancel()
        // Failed sign-out retains the existing identity under the newer epoch.
        const message = normalizeError(maybeError, 'Sign out failed')
        await recoverFailedSignOut(epoch, message)
        throw new Error(message)
      }
      if (disposed) {
        barrier.cancel()
        return result
      }
      await barrier.wait(null)
      return result
    })
  }

  // ---- ready() (snapshot semantics, architecture invariant) -------------------------
  async function ready(options?: { timeoutMs?: number }): Promise<ConvexAuthStatus> {
    const timeoutMs = options?.timeoutMs ?? 0
    const captured: Array<Promise<unknown>> = []
    if (!settled) captured.push(initialSettlement.promise)
    if (refreshPromise) captured.push(refreshPromise)
    if (captured.length === 0) return status.value

    const wait = Promise.allSettled(captured)
    if (timeoutMs === 0) {
      await wait
      return status.value
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      await Promise.race([
        wait,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs)
        }),
      ])
    } finally {
      if (timer !== null) clearTimeout(timer)
    }
    return status.value
  }

  // ---- initial settlement --------------------------------------------------
  function attachPrimary(client: ConvexClient): void {
    if (disposed) return
    currentClient = client
    const hydratedIdentity = state.identity.value

    if (hydratedIdentity.status === 'authenticated') {
      // SSR hydration may render the display identity, but it is not a usable
      // browser identity until this client's server transition confirms it.
      stagedToken = hydratedIdentity.token
      stagedUser = hydratedIdentity.user
      stagedKey = hydratedIdentity.key
      void pending.run(async () => {
        await confirmCurrentClient(client, authEpoch)
        if (!disposed && settled) {
          logAuth({
            phase: 'hydrate',
            outcome: 'success',
            details: { source: 'ssr-confirmed' },
          })
        }
      })
      return
    }

    // No hydrated session: resolve the initial identity explicitly (total fetch),
    // then confirm the primary. A definitive failure without a usable identity
    // settles `error`; a clean anonymous result settles `anonymous`.
    void pending.run(async () => {
      const epoch = authEpoch
      if (!authClient) {
        publishAnonymous(state.authError.value)
        return
      }
      const outcome = await fetchConvexToken(authClient, {
        signal: disposalController.signal,
      })
      if (disposed || epoch !== authEpoch) return
      if (outcome.identity) {
        stagedToken = outcome.identity.token
        stagedUser = outcome.identity.user
        stagedKey = safeIdentityKey(outcome.identity.user)
        await confirmCurrentClient(client, epoch)
      } else if (outcome.authError) {
        publishAnonymous(outcome.authError)
      } else {
        publishAnonymous(null)
      }
    })
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    disposalController.abort()
    resolveDisposal()
    clearRetry()
    // Teardown is a cancellation boundary, not a reason to abandon promises.
    // Every waiter is released so sign-in/out/refresh and ready({ timeoutMs: 0 })
    // cannot remain pending after the owning Nuxt application is disposed.
    initialSettlement.resolve()
    resolveSettlementWaiters()
    for (const cancel of [...activeConfirmationCancellations]) cancel()
    activeConfirmationCancellations.clear()
    for (const confirmation of pendingConfirmations.values()) confirmation.resolve()
    pendingConfirmations.clear()
    sessionSynchronization.dispose()
    listeners.clear()
  }

  // ---- port ----------------------------------------------------------------
  const port: ClientIdentityPort = {
    snapshot(): ClientIdentitySnapshot {
      const usableIdentity =
        stagedKey !== 'anonymous' ? stagedKey : identityKeyOf(state.identity.value)
      const settledNow = settled
      const identityKey = settledNow ? usableIdentity : null
      const hasUsableIdentity = identityKey !== null && identityKey !== 'anonymous'
      const portError: ConvexCallError | null =
        settledNow && !hasUsableIdentity && state.authError.value
          ? new ConvexCallError({
              kind: 'authentication',
              message: state.authError.value,
            })
          : null
      return {
        authEnabled: true,
        settled: settledNow,
        identityKey,
        authEpoch,
        identityGeneration,
        error: portError,
      }
    },
    waitForInitialSettlement() {
      if (settled) return Promise.resolve()
      return new Promise<void>((resolve) => {
        settlementWaiters.add(resolve)
      })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async initializePrimary(candidate) {
      if (disposed) throw createIdentityChangedError('primary initialization')
      // Owner-driven replacement: capture the fresh candidate, install setAuth,
      // and await the confirmation that publishes the staged identity. For an
      // anonymous target a fresh client is already anonymous → publish + resolve.
      // commitTransition's epoch guard serializes generation bumps, so the
      // current epoch/generation are exactly the transition that requested this
      // one candidate. The port does not duplicate those values as inputs.
      currentClient = candidate
      const epoch = authEpoch
      const gen = identityGeneration
      if (stagedKey === 'anonymous') {
        publishAnonymous(state.authError.value)
        resolveConfirmation(gen)
        return
      }
      const done = pendingConfirmations.get(gen)?.promise
      await installSetAuth(candidate, epoch, gen)
      if (done) await done
    },
    failPrimary(generation, failure) {
      if (disposed || generation !== identityGeneration) return
      const failedAuthenticatedTarget = stagedKey !== 'anonymous'
      const normalized =
        failure instanceof ConvexCallError
          ? failure
          : new ConvexCallError({
              kind: 'authentication',
              code: 'PRIMARY_INITIALIZATION_FAILED',
              message: 'Convex authentication could not be initialized',
              cause: failure,
            })
      state.identity.value = ANONYMOUS_IDENTITY
      state.authError.value = normalized.message
      if (failedAuthenticatedTarget) {
        // This generation's authenticated candidate is unusable and its prior
        // principal was already retired. Let commitTransition supersede that
        // crossed generation and create exactly one fresh anonymous candidate.
        const epoch = (authEpoch += 1)
        void commitTransition(ANONYMOUS_IDENTITY, epoch).catch(() => {
          if (!disposed && epoch === authEpoch) publishAnonymous(normalized.message)
        })
        return
      }

      // Failure of the one anonymous recovery candidate is terminal. Publish
      // the fail-closed state and release the generation without retrying.
      stagedToken = null
      stagedUser = null
      stagedKey = 'anonymous'
      publishAnonymous(normalized.message)
      resolveConfirmation(generation)
    },
  }

  function wrapNamespace<T extends object>(namespace: T): T {
    return createIntegratedAuthNamespace(
      namespace,
      sessionSynchronization.createBarrier,
      executeIntegratedOperation,
    )
  }

  // Memoize the integrated namespaces once so `auth.signIn === auth.signIn`
  // across composable calls (referential stability).
  const integratedSignIn = authClient ? wrapNamespace(authClient.signIn as object) : null
  const integratedSignUp = authClient ? wrapNamespace(authClient.signUp as object) : null

  return {
    port,
    status,
    isPending: pending.isPending,
    isAuthenticated,
    token,
    user,
    error,
    wrapNamespace,
    integratedSignIn,
    integratedSignUp,
    ready,
    refresh,
    reconcileSession,
    signOut,
    attachPrimary,
    dispose,
  }
}

function safeIdentityKey(user: ConvexUser | null): ConvexIdentityKey {
  try {
    return getConvexIdentityKey(user)
  } catch {
    return 'anonymous'
  }
}

function normalizeError(value: unknown, fallback: string): string {
  if (value instanceof Error) return value.message
  if (value && typeof value === 'object' && 'message' in value) {
    return String((value as { message: unknown }).message)
  }
  if (typeof value === 'string' && value.length > 0) return value
  return fallback
}
