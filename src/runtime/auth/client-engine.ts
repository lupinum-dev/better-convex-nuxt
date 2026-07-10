import type { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import { computed, type ComputedRef, type Ref } from 'vue'

import { ConvexCallError } from '../errors'
import { deriveConvexAuthStatus, type ConvexAuthStatus } from '../utils/auth-status'
import { getConvexIdentityKey, type ConvexIdentityKey } from '../utils/identity-key'
import type { Logger } from '../utils/logger'
import type { ConvexUser } from '../utils/types'
import {
  ANONYMOUS_IDENTITY,
  identityKeyOf,
  LOADING_IDENTITY,
  toAuthenticatedIdentity,
  type AuthIdentity,
} from './auth-identity'
import type { AuthIdentityPort, AuthIdentitySnapshot } from './identity-port'
import { createIntegratedAuthNamespace } from './integrated-namespace'
import { createPendingOperations } from './pending-operations'
import { createSerialQueue } from './serial-queue'
import {
  fetchConvexToken,
  isTokenUsable,
  RETRY_BACKOFF_MS,
  type ConvexTokenSource,
} from './token-fetcher'

type AuthClient = ReturnType<typeof createAuthClient>

/** Better Auth client augmented with the prepended Convex token plugin. */
export type AuthClientWithConvex = AuthClient & ConvexTokenSource

/** The mutable useState-backed public mirror the coordinator writes (SSR-seeded). */
export interface ConvexAuthCoordinatorState {
  token: Ref<string | null>
  user: Ref<ConvexUser | null>
  /** `true` while initial resolution is unsettled — the `loading` signal. */
  pending: Ref<boolean>
  authError: Ref<string | null>
}

/**
 * The per-Nuxt-app auth coordinator (internal §6.3 one effect coordinator). It
 * owns identity as a discriminated value, the two counters, the pending-operation
 * counter, the serial identity-operation queue, epoch-scoped refresh dedup, the
 * total token fetcher, `ready()`, status derivation, and Convex `setAuth`
 * coordination. It publishes the {@link AuthIdentityPort} consumed by the client
 * owner and query gating.
 */
export interface ConvexAuthCoordinator {
  readonly port: AuthIdentityPort
  readonly status: ComputedRef<ConvexAuthStatus>
  readonly isPending: ComputedRef<boolean>
  readonly isAuthenticated: ComputedRef<boolean>
  readonly token: Readonly<Ref<string | null>>
  readonly user: Readonly<Ref<ConvexUser | null>>
  readonly error: ComputedRef<ConvexCallError | null>
  /** Wrap a Better Auth `signIn`/`signUp` namespace with serial synchronization. */
  wrapNamespace<T extends object>(namespace: T): T
  /** Referentially-stable integrated `signIn` namespace (null with no client). */
  readonly integratedSignIn: object | null
  /** Referentially-stable integrated `signUp` namespace (null with no client). */
  readonly integratedSignUp: object | null
  ready(options?: { timeoutMs?: number }): Promise<ConvexAuthStatus>
  refresh(): Promise<void>
  signOut(): Promise<unknown>
  /** Install the initial `setAuth` on the owner's primary and resolve settlement. */
  attachPrimary(client: ConvexClient): void
  dispose(): void
}

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
  wasServerRendered?: () => boolean
}): ConvexAuthCoordinator {
  const { authClient, state } = input
  const purgeIdentityPayloads = input.purgeIdentityPayloads ?? (() => {})
  const logAuth = input.logger?.auth ?? (() => {})

  // ---- counters (internal §6.5) --------------------------------------------
  let authEpoch = 0
  let identityGeneration = 0

  // ---- published identity + staged candidate -------------------------------
  let identity: AuthIdentity = LOADING_IDENTITY
  let settled = false
  // The private candidate served by `setAuth`; published only after confirmation.
  let stagedToken: string | null = null
  let stagedUser: ConvexUser | null = null
  let stagedKey: ConvexIdentityKey = 'anonymous'

  // ---- current primary + confirmation handshakes ---------------------------
  let currentClient: ConvexClient | null = null
  const pendingConfirmations = new Map<number, VoidDeferred>()

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
      identityKey: safeIdentityKey(state.user.value),
      error: state.authError.value
        ? new ConvexCallError({ kind: 'authentication', message: state.authError.value })
        : null,
    }),
  )
  const isAuthenticated = computed(() => Boolean(state.token.value) && Boolean(state.user.value))
  const error = computed<ConvexCallError | null>(() =>
    state.authError.value
      ? new ConvexCallError({ kind: 'authentication', message: state.authError.value })
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
    identity = toAuthenticatedIdentity(token, user)
    if (identity.status === 'authenticated') {
      state.token.value = identity.token
      state.user.value = identity.user
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
    identity = ANONYMOUS_IDENTITY
    state.token.value = null
    state.user.value = null
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
        return isTokenUsable(stagedToken) ? stagedToken : null
      }
      if (!forceRefreshToken && isTokenUsable(stagedToken)) return stagedToken
      if (!authClient) return isTokenUsable(stagedToken) ? stagedToken : null

      const outcome = await fetchConvexToken(authClient)
      if (disposed || epoch !== authEpoch) {
        return isTokenUsable(stagedToken) ? stagedToken : null
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
      // Transient/definitive failure. Retain a still-usable token and schedule a
      // coalesced retry; otherwise report definitive absence (null).
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
      installSetAuth(currentClient, epoch, null)
    }, delay)
  }

  // ---- confirmation ordering -----------------------------------------------
  function installSetAuth(client: ConvexClient, epoch: number, gen: number | null) {
    let settledOnce = false
    client.setAuth(makeSetAuthFetcher(epoch), (isAuthenticated) => {
      if (disposed) return
      if (epoch !== authEpoch) {
        if (!settledOnce) {
          settledOnce = true
          if (gen !== null) resolveConfirmation(gen)
        }
        return
      }
      if (isAuthenticated) {
        if (stagedKey !== 'anonymous' && stagedToken && stagedUser) {
          publishAuthenticated(stagedToken, stagedUser)
        } else {
          publishAnonymous(null)
        }
      } else {
        // Rejected token: definitive revocation → anonymous, error cleared.
        publishAnonymous(null)
      }
      if (!settledOnce) {
        settledOnce = true
        if (gen !== null) resolveConfirmation(gen)
      }
    })
  }

  function resolveConfirmation(gen: number) {
    const deferred = pendingConfirmations.get(gen)
    if (deferred) {
      pendingConfirmations.delete(gen)
      deferred.resolve()
    }
  }

  // ---- core transition (post-settlement) -----------------------------------
  async function commitTransition(target: AuthIdentity, epoch: number): Promise<void> {
    if (disposed || epoch !== authEpoch) return
    const targetKey = identityKeyOf(target)
    const currentKey = identityKeyOf(identity)

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

    if (targetKey === currentKey) {
      // Same identity key. Anonymous→anonymous publishes directly; same-user
      // token rotation re-confirms the token on the CURRENT client in place.
      if (target.status === 'authenticated' && currentClient) {
        installSetAuth(currentClient, epoch, null)
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

  // ---- integrated sign-in/sign-up synchronization --------------------------
  function synchronizeIdentity(): Promise<void> {
    return queue.enqueue(() =>
      pending.run(async () => {
        const epoch = (authEpoch += 1)
        clearRetry()
        const source = authClient
        if (!source) return
        const outcome = await fetchConvexToken(source)
        if (disposed || epoch !== authEpoch) return
        if (outcome.identity) {
          await commitTransition(
            toAuthenticatedIdentity(outcome.identity.token, outcome.identity.user),
            epoch,
          )
        } else if (outcome.authError) {
          // A token-bearing Better Auth result that fails the Convex exchange keeps
          // a still-usable identity on a transient failure; otherwise surfaces the
          // error over an anonymous transition.
          if (identity.status === 'authenticated' && !outcome.definitive) {
            state.authError.value = outcome.authError
            notify()
          } else {
            state.authError.value = outcome.authError
            await commitTransition(ANONYMOUS_IDENTITY, epoch)
          }
        } else {
          await commitTransition(ANONYMOUS_IDENTITY, epoch)
        }
      }),
    )
  }

  // ---- background refresh (epoch-scoped dedup) -----------------------------
  function refresh(): Promise<void> {
    // Deduplicate per authEpoch: a caller holding a newer epoch starts a fresh
    // refresh instead of awaiting a stale one (decision 3).
    if (refreshPromise && refreshEpoch === authEpoch) return refreshPromise

    const epoch = authEpoch
    refreshEpoch = epoch
    refreshPromise = pending
      .run(async () => {
        const source = authClient
        if (!source) return
        const outcome = await fetchConvexToken(source)
        // Commit only while the captured epoch remains current (cannot commit
        // across authEpoch).
        if (disposed || epoch !== authEpoch) return
        if (outcome.identity) {
          const target = toAuthenticatedIdentity(outcome.identity.token, outcome.identity.user)
          const targetKey = identityKeyOf(target)
          if (targetKey === identityKeyOf(identity) && targetKey !== 'anonymous') {
            // Same-user rotation: authEpoch advances, identityGeneration does not.
            authEpoch += 1
            stagedToken = target.status === 'authenticated' ? target.token : null
            stagedUser = target.status === 'authenticated' ? target.user : null
            if (target.status === 'authenticated' && currentClient) {
              installSetAuth(currentClient, authEpoch, null)
            }
          } else {
            authEpoch += 1
            await commitTransition(target, authEpoch)
          }
        } else if (outcome.authError) {
          if (identity.status === 'authenticated' && !outcome.definitive) {
            // Transient failure over a usable identity: keep it, record error.
            state.authError.value = outcome.authError
            notify()
          } else {
            // Definitive 401/403 or no usable identity: transition to anonymous.
            authEpoch += 1
            await commitTransition(ANONYMOUS_IDENTITY, authEpoch)
          }
        } else if (identity.status === 'authenticated' || state.authError.value) {
          // Clean anonymous outcome (no session, no error). If a still-usable
          // identity or a stale error was previously published, clear it — this
          // is the required `authenticated -> anonymous` and `error -> anonymous`
          // background-refresh transitions (vNext §5.3). Clear the stale error
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
  function signOut(): Promise<unknown> {
    return queue.enqueue(() =>
      pending.run(async () => {
        if (!authClient) {
          const message =
            '[useConvexAuth] Cannot sign out because Better Auth client is unavailable'
          state.authError.value = message
          throw new Error(message)
        }
        // Advance authEpoch AT DEQUEUE, before awaiting Better Auth (decision 3).
        const epoch = (authEpoch += 1)
        clearRetry()
        const result = await authClient.signOut()
        const maybeError =
          result && typeof result === 'object' && 'error' in result
            ? (result as { error?: unknown }).error
            : null
        if (maybeError) {
          // Failed sign-out retains the existing identity under the newer epoch.
          const message = normalizeError(maybeError, 'Sign out failed')
          if (epoch === authEpoch) state.authError.value = message
          throw new Error(message)
        }
        if (disposed || epoch !== authEpoch) return result
        await commitTransition(ANONYMOUS_IDENTITY, epoch)
        return result
      }),
    )
  }

  // ---- ready() (snapshot semantics, internal §6.4) -------------------------
  async function ready(options?: { timeoutMs?: number }): Promise<ConvexAuthStatus> {
    const timeoutMs = options?.timeoutMs ?? 5_000
    const captured: Array<Promise<unknown>> = []
    if (!settled) captured.push(initialSettlement.promise)
    if (refreshPromise) captured.push(refreshPromise)
    if (captured.length === 0) return status.value

    const wait = Promise.allSettled(captured)
    if (timeoutMs === 0) {
      await wait
      return status.value
    }
    await Promise.race([
      wait,
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs)
      }),
    ])
    return status.value
  }

  // ---- initial settlement --------------------------------------------------
  function attachPrimary(client: ConvexClient): void {
    currentClient = client
    const hydratedToken = state.token.value
    const hydratedUser = state.user.value

    if (hydratedToken && hydratedUser) {
      // SSR-hydrated snapshot: publish the settled authenticated state BEFORE
      // client-side confirmation (the stated exception, vNext §5.3). The socket
      // pauses on setAuth until the token is confirmed, so no work runs unauthed.
      stagedToken = hydratedToken
      stagedUser = hydratedUser
      stagedKey = safeIdentityKey(hydratedUser)
      identity = toAuthenticatedIdentity(hydratedToken, hydratedUser)
      settled = true
      state.pending.value = false
      initialSettlement.resolve()
      resolveSettlementWaiters()
      installSetAuth(client, authEpoch, null)
      logAuth({ phase: 'hydrate', outcome: 'success', details: { source: 'ssr' } })
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
      const outcome = await fetchConvexToken(authClient)
      if (disposed || epoch !== authEpoch) return
      if (outcome.identity) {
        stagedToken = outcome.identity.token
        stagedUser = outcome.identity.user
        stagedKey = safeIdentityKey(outcome.identity.user)
        installSetAuth(client, epoch, null)
        await initialSettlement.promise
      } else if (outcome.authError) {
        publishInitialError(outcome.authError)
      } else {
        publishAnonymous(null)
      }
    })
  }

  // Initial resolution failed with no usable identity: settle `error` (vNext
  // §5.3), preserving the normalized message so `optional`/`required` surface it
  // without executing anonymously.
  function publishInitialError(message: string) {
    identity = ANONYMOUS_IDENTITY
    stagedToken = null
    stagedUser = null
    stagedKey = 'anonymous'
    state.token.value = null
    state.user.value = null
    state.authError.value = message
    markSettled()
    resolveSettlementWaiters()
    notify()
  }

  function dispose(): void {
    disposed = true
    clearRetry()
    listeners.clear()
    settlementWaiters.clear()
    pendingConfirmations.clear()
  }

  // ---- port ----------------------------------------------------------------
  const port: AuthIdentityPort = {
    snapshot(): AuthIdentitySnapshot {
      const usableIdentity = stagedKey !== 'anonymous' ? stagedKey : identityKeyOf(identity)
      const settledNow = settled
      const identityKey = settledNow ? usableIdentity : null
      const hasUsableIdentity = identityKey !== null && identityKey !== 'anonymous'
      const portError: ConvexCallError | null =
        settledNow && !hasUsableIdentity && state.authError.value
          ? new ConvexCallError({ kind: 'authentication', message: state.authError.value })
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
      // Owner-driven replacement: capture the fresh candidate, install setAuth,
      // and await the confirmation that publishes the staged identity. For an
      // anonymous target a fresh client is already anonymous → publish + resolve.
      // Reading the CURRENT epoch/generation here (instead of the port
      // signature's second parameter) is safe because commitTransition's
      // `epoch !== authEpoch` guard serializes generation bumps — at most one
      // generation transition is pending at a time, so the current read always
      // matches the transition that triggered this replacement.
      currentClient = candidate
      const epoch = authEpoch
      const gen = identityGeneration
      if (stagedKey === 'anonymous') {
        publishAnonymous(state.authError.value)
        resolveConfirmation(gen)
        return
      }
      const done = pendingConfirmations.get(gen)?.promise
      installSetAuth(candidate, epoch, gen)
      if (done) await done
    },
  }

  function wrapNamespace<T extends object>(namespace: T): T {
    return createIntegratedAuthNamespace(namespace, synchronizeIdentity)
  }

  // Memoize the integrated namespaces once so `auth.signIn === auth.signIn`
  // across composable calls (referential stability, vNext §8).
  const integratedSignIn = authClient ? wrapNamespace(authClient.signIn as object) : null
  const integratedSignUp = authClient ? wrapNamespace(authClient.signUp as object) : null

  return {
    port,
    status,
    isPending: pending.isPending,
    isAuthenticated,
    token: state.token,
    user: state.user,
    error,
    wrapNamespace,
    integratedSignIn,
    integratedSignUp,
    ready,
    refresh,
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
