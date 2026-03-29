/**
 * Centralized auth state machine for better-convex-nuxt.
 *
 * All auth state mutations flow through this engine via two atomic commit
 * functions: `commitAuthenticated` and `commitUnauthenticated`. This ensures
 * token and user are always set together — there is no intermediate state
 * where token is set but user is null, or vice versa.
 *
 * Architecture:
 * - One engine per NuxtApp, stored in a WeakMap (auto-GC on app teardown)
 * - The engine owns reactive state (token, user, pending, error) but does
 *   NOT own how tokens are fetched — that is the transport's job
 * - The transport (auth-client.ts) returns pure `ClientAuthStateResult` values;
 *   the engine decides whether to commit them based on operation staleness
 * - Race protection uses a monotonic `operationId` counter: each signOut,
 *   invalidate, or refresh bumps the ID, and any in-flight operation whose
 *   captured ID no longer matches is silently discarded
 *
 * Lifecycle:
 * 1. `createSharedAuthEngine()` — called once from plugin.client.ts
 * 2. `configureTransport()` — wires the auth client as the token source
 * 3. `getSharedAuthEngine()` — called from composables to access the engine
 *
 * @module auth-engine
 */
import type { createAuthClient } from 'better-auth/vue'
import { computed, type ComputedRef, type Ref } from 'vue'

import { AUTH_REFRESH_TIMEOUT_MS } from '../utils/constants'
import { waitForPendingClear } from '../utils/auth-pending'
import type {
  ConvexAuthChangedPayload,
  ConvexUser,
} from '../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

/** Minimal app interface for hook registration and emission. */
interface RuntimeHookApp {
  hook(event: 'better-convex:auth:refresh', fn: () => void | Promise<void>): () => void
  hook(event: 'better-convex:auth:invalidate', fn: () => void | Promise<void>): () => void
  callHook?: (event: 'convex:auth:changed', payload: ConvexAuthChangedPayload) => Promise<unknown>
}

type AuthSource = 'skip' | 'hydrated-token' | 'recent-token-cache' | 'exchange'

/**
 * Result of a token fetch operation from the transport layer.
 *
 * This is a discriminated union: when `token` is non-null, `user` is
 * guaranteed non-null and `error` is null (and vice versa). This makes
 * the token/user co-presence invariant compile-time enforced.
 *
 * The optional `onCommit` callback is called by the engine only when
 * the result is accepted (not stale). This allows the transport to
 * defer side effects (like updating cache timestamps) until commit.
 */
export type ClientAuthStateResult =
  | { token: string; user: ConvexUser; error: null; source: AuthSource; onCommit?: () => void }
  | { token: null; user: null; error: string | null; source: AuthSource; onCommit?: () => void }

/** Callback signature used by ConvexClient.setAuth(). */
type ConvexFetchToken = (input: {
  forceRefreshToken: boolean
  signal?: AbortSignal
}) => Promise<string | null>

/**
 * Transport layer interface between the auth engine and the token source.
 *
 * The transport fetches tokens but never mutates Nuxt reactive state directly.
 * It returns `ClientAuthStateResult` values that the engine commits atomically.
 *
 * Call protocol: `install()` must be called before `refresh()` or `invalidate()`.
 */
export interface AuthTransport {
  /** The Better Auth client instance, used by the engine for signOut(). */
  client: AuthClient | null
  /** Token resolution with deferred side effects via `onCommit`. */
  fetchAuthState: (input: {
    forceRefreshToken: boolean
    signal?: AbortSignal
  }) => Promise<ClientAuthStateResult>
  /** Wire fetchToken into the ConvexClient. Called once at startup. */
  install: (fetchToken: ConvexFetchToken, onChange: (isAuthenticated: boolean) => void) => void
  /** Re-authenticate by calling setAuth with forceRefreshToken. */
  refresh: (fetchToken: ConvexFetchToken, onChange: (isAuthenticated: boolean) => void) => Promise<void>
  /** Clear the ConvexClient's auth state. */
  invalidate: () => Promise<void>
}

/** Snapshot of auth state used for change detection in hook emission. */
interface AuthSnapshot {
  isAuthenticated: boolean
  user: ConvexUser | null
  userId: string | null
}

/**
 * Internal mutable state for the auth engine.
 * Stored in a WeakMap keyed by NuxtApp — never exposed publicly.
 */
interface AuthEngineState {
  transport: AuthTransport | null
  refreshPromise: Promise<void> | null
  signOutPromise: Promise<void> | null
  /** Monotonic counter for stale-operation detection. See module doc. */
  operationId: number
  snapshot: AuthSnapshot
  hooksRegistered: boolean
}

/** Public interface of the shared auth engine. */
export interface SharedAuthEngine {
  token: Readonly<Ref<string | null>>
  user: Readonly<Ref<ConvexUser | null>>
  pending: Readonly<Ref<boolean>>
  rawAuthError: Readonly<Ref<string | null>>
  wasAuthenticated: Readonly<Ref<boolean>>
  authError: ComputedRef<Error | null>
  isAuthenticated: ComputedRef<boolean>
  isAnonymous: ComputedRef<boolean>
  isSessionExpired: ComputedRef<boolean>
  readonly client: AuthClient | null
  configureTransport: (transport: AuthTransport | null) => void
  syncSnapshot: () => void
  refreshAuth: () => Promise<void>
  invalidateAuth: (options?: {
    clearWasAuthenticated?: boolean
    preservePending?: boolean
  }) => Promise<void>
  signOut: () => Promise<void>
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
  initialize: (options?: {
    error?: string | null
    resolveInitialAuth?: boolean
  }) => void
}

export interface CreateSharedAuthEngineOptions {
  nuxtApp: RuntimeHookApp
  token: Ref<string | null>
  user: Ref<ConvexUser | null>
  pending: Ref<boolean>
  rawAuthError: Ref<string | null>
  wasAuthenticated: Ref<boolean>
  transport?: AuthTransport | null
  onSetAuthState?: (isAuthenticated: boolean) => void
  resolveInitialAuth?: () => void
}

const authEngineStates = new WeakMap<object, AuthEngineState>()
const authEngines = new WeakMap<object, SharedAuthEngine>()

function buildSnapshot(token: string | null, user: ConvexUser | null): AuthSnapshot {
  const isAuthenticated = Boolean(token && user)

  return {
    isAuthenticated,
    user: isAuthenticated ? user : null,
    userId: isAuthenticated ? user!.id : null,
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => Error): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(onTimeout())
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  })
}

function getEngineState(nuxtApp: object, token: Ref<string | null>, user: Ref<ConvexUser | null>): AuthEngineState {
  const existing = authEngineStates.get(nuxtApp)
  if (existing) {
    return existing
  }

  const created: AuthEngineState = {
    transport: null,
    refreshPromise: null,
    signOutPromise: null,
    operationId: 0,
    snapshot: buildSnapshot(token.value, user.value),
    hooksRegistered: false,
  }
  authEngineStates.set(nuxtApp, created)
  return created
}

/**
 * Retrieve the shared auth engine for a NuxtApp instance.
 * Called from composables — the engine must already be created by the plugin.
 */
export function getSharedAuthEngine(nuxtApp: object): SharedAuthEngine {
  const engine = authEngines.get(nuxtApp)
  if (!engine) {
    throw new Error(
      '[better-convex-nuxt] Auth engine not initialized. '
      + 'Ensure the Convex client plugin runs before composables.',
    )
  }
  return engine
}

/**
 * Create and register the shared auth engine for a NuxtApp instance.
 * Called once from plugin.client.ts during app initialization.
 * Subsequent access uses `getSharedAuthEngine()`.
 */
export function createSharedAuthEngine(
  options: CreateSharedAuthEngineOptions,
): SharedAuthEngine {
  const {
    nuxtApp,
    token,
    user,
    pending,
    rawAuthError,
    wasAuthenticated,
    onSetAuthState,
    resolveInitialAuth,
  } = options

  const existingEngine = authEngines.get(nuxtApp)
  if (existingEngine) {
    if (import.meta.dev) {
      console.warn(
        '[better-convex-nuxt] createSharedAuthEngine() called more than once for the same Nuxt app. Reusing the existing engine.',
      )
    }
    return existingEngine
  }

  const state = getEngineState(nuxtApp, token, user)
  const authError = computed(() => (rawAuthError.value ? new Error(rawAuthError.value) : null))
  const isAuthenticated = computed(() => Boolean(token.value && user.value))
  const isAnonymous = computed(() => !pending.value && !isAuthenticated.value)
  const isSessionExpired = computed(
    () => !pending.value && !isAuthenticated.value && wasAuthenticated.value,
  )

  // --- Emit & Commit helpers ---
  // These are the ONLY paths that mutate token/user/error refs.
  // Keeping them centralized prevents split-brain auth state.

  /** Emit convex:auth:changed only when authentication or identity actually changed. */
  const emitIfChanged = (nextSnapshot: AuthSnapshot) => {
    const previousSnapshot = state.snapshot
    state.snapshot = nextSnapshot

    const changed =
      previousSnapshot.isAuthenticated !== nextSnapshot.isAuthenticated
      || previousSnapshot.userId !== nextSnapshot.userId

    if (!changed) {
      return
    }

    const payload: ConvexAuthChangedPayload = {
      isAuthenticated: nextSnapshot.isAuthenticated,
      previousIsAuthenticated: previousSnapshot.isAuthenticated,
      user: nextSnapshot.user,
      previousUser: previousSnapshot.user,
    }
    nuxtApp.callHook?.('convex:auth:changed', payload)?.catch((error: unknown) => {
      console.error('[better-convex-nuxt] Error in convex:auth:changed hook handler:', error)
    })
  }

  const commitAuthenticated = (nextToken: string, nextUser: ConvexUser) => {
    token.value = nextToken
    user.value = nextUser
    rawAuthError.value = null
    wasAuthenticated.value = true
    emitIfChanged(buildSnapshot(nextToken, nextUser))
  }

  const commitUnauthenticated = (nextError: string | null, options?: {
    clearWasAuthenticated?: boolean
    emit?: boolean
  }) => {
    token.value = null
    user.value = null
    rawAuthError.value = nextError
    if (options?.clearWasAuthenticated) {
      wasAuthenticated.value = false
    }

    const nextSnapshot = buildSnapshot(null, null)
    if (options?.emit === false) {
      state.snapshot = nextSnapshot
      return
    }
    emitIfChanged(nextSnapshot)
  }

  const settleInitialAuth = () => {
    resolveInitialAuth?.()
    pending.value = false
  }

  /**
   * Token provider wired into ConvexClient.setAuth().
   *
   * Delegates to the transport for the actual fetch, then checks whether
   * the operation is still current before committing. This is the bridge
   * between the Convex SDK's pull-based auth and our push-based engine.
   */
  const fetchTokenForConvex: ConvexFetchToken = async (input) => {
    if (!state.transport) {
      settleInitialAuth()
      return null
    }

    const operationId = state.operationId
    const result = await state.transport.fetchAuthState(input)
    if (operationId !== state.operationId) {
      // Safe to discard: the operation that bumped operationId will commit
      // its own state. Any error in this result is irrelevant — the newer
      // operation will overwrite it via commitAuthenticated or commitUnauthenticated.
      settleInitialAuth()
      return null
    }

    if (result.token !== null) {
      commitAuthenticated(result.token, result.user)
      settleInitialAuth()
      try {
        result.onCommit?.()
      } catch (error) {
        console.error('[better-convex-nuxt] Error in auth transport onCommit callback:', error)
      }
      return result.token
    }

    commitUnauthenticated(result.error, { emit: true })
    settleInitialAuth()
    return null
  }

  const onTransportAuthStateChange = (authenticated: boolean) => {
    onSetAuthState?.(authenticated)
  }

  const configureTransport = (transport: AuthTransport | null) => {
    if (state.transport && state.transport !== transport) {
      ++state.operationId
    }
    state.transport = transport
    if (transport) {
      transport.install(fetchTokenForConvex, onTransportAuthStateChange)
    }
  }

  /**
   * Refresh auth state by re-running the full token fetch cycle.
   *
   * Deduplication: concurrent callers share one in-flight promise.
   * Race protection: bumps operationId so any concurrent signOut or
   * invalidate will cause this refresh's result to be discarded.
   */
  const refreshAuth = async (): Promise<void> => {
    // Dedup: return the existing in-flight refresh if one is running
    if (state.refreshPromise) {
      return state.refreshPromise
    }

    if (!state.transport) {
      const message = rawAuthError.value ?? 'Convex auth client is not initialized'
      commitUnauthenticated(message, { emit: false })
      pending.value = false
      throw new Error(message)
    }

    // Capture transport before the IIFE — TS can't narrow across async closures
    const transport = state.transport
    state.refreshPromise = (async () => {
      pending.value = true
      rawAuthError.value = null
      // Bump operationId: any older in-flight fetch becomes stale
      const operationId = ++state.operationId

      try {
        await withTimeout(
          transport.refresh(fetchTokenForConvex, onTransportAuthStateChange),
          AUTH_REFRESH_TIMEOUT_MS,
          () => {
            if (import.meta.dev) {
              console.warn(
                `[better-convex-nuxt] Auth refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms. Check auth configuration.`,
              )
            }
            return new Error(`Authentication refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms`)
          },
        )

        if (operationId !== state.operationId) {
          return
        }

        if (token.value) {
          return
        }

        throw new Error(rawAuthError.value ?? 'Authentication refresh completed without a token')
      } catch (error) {
        if (operationId !== state.operationId) {
          if (import.meta.dev) {
            console.debug('[better-convex-nuxt] Discarding stale refresh error (superseded by newer operation):', error)
          }
          return
        }

        const message = error instanceof Error ? error.message : String(error)
        commitUnauthenticated(message)
        throw error
      } finally {
        pending.value = false
        state.refreshPromise = null
      }
    })()

    return state.refreshPromise
  }

  const invalidateAuth = async (options?: {
    clearWasAuthenticated?: boolean
    preservePending?: boolean
  }): Promise<void> => {
    ++state.operationId
    commitUnauthenticated(null, {
      clearWasAuthenticated: options?.clearWasAuthenticated ?? false,
    })

    if (!options?.preservePending) {
      pending.value = false
    }

    if (!state.transport) {
      return
    }

    await state.transport.invalidate()
  }

  /**
   * Sign out: clear local state, then clean up transport and upstream session.
   *
   * Fail-closed design: local state is cleared BEFORE any async cleanup.
   * If transport.invalidate() or client.signOut() throws, the user is already
   * deauthenticated locally — we surface the error but never restore the session.
   *
   * Dual cleanup: transport.invalidate() clears the ConvexClient's auth;
   * client.signOut() clears the Better Auth session cookie. Both run even
   * if one fails — the first error is captured and re-thrown after both complete.
   */
  const signOut = async (): Promise<void> => {
    // Dedup: return existing in-flight sign-out
    if (state.signOutPromise) {
      return state.signOutPromise
    }

    // Capture before IIFE — TS can't narrow across async closures
    const transport = state.transport
    const client = transport?.client ?? null
    state.signOutPromise = (async () => {
      pending.value = true
      rawAuthError.value = null
      // Bump operationId FIRST so any in-flight refresh sees it's stale
      ++state.operationId
      // Commit unauthenticated immediately (fail-closed)
      commitUnauthenticated(null, { clearWasAuthenticated: true })

      let firstError: unknown = null
      const captureCleanupError = (error: unknown, phase: 'invalidate' | 'signOut') => {
        if (firstError === null) {
          firstError = error
          return
        }

        console.error(`[better-convex-nuxt] Additional auth signOut ${phase} error:`, error)
      }

      try {
        // Step 1: Clear ConvexClient's auth state
        if (transport) {
          try {
            await transport.invalidate()
          } catch (error) {
            captureCleanupError(error, 'invalidate')
          }
        }

        // Step 2: Clear Better Auth session (runs even if step 1 failed)
        if (client) {
          try {
            await client.signOut()
          } catch (error) {
            captureCleanupError(error, 'signOut')
          }
        }

        if (firstError) {
          const message = firstError instanceof Error ? firstError.message : String(firstError)
          rawAuthError.value = message
          throw firstError
        }
      } finally {
        pending.value = false
        state.signOutPromise = null
      }
    })()

    return state.signOutPromise
  }

  /**
   * Wait for auth to settle (pending becomes false), then return final state.
   * On SSR, returns synchronously — there's no pending auth on the server.
   */
  const awaitAuthReady = async (options?: { timeoutMs?: number }): Promise<boolean> => {
    if (!import.meta.client) {
      return isAuthenticated.value
    }

    await waitForPendingClear(pending, {
      timeoutMs: options?.timeoutMs ?? AUTH_REFRESH_TIMEOUT_MS,
    })

    if (import.meta.dev && !isAuthenticated.value && pending.value) {
      console.warn(
        `[better-convex-nuxt] Auth state did not settle within ${options?.timeoutMs ?? AUTH_REFRESH_TIMEOUT_MS}ms. Check auth configuration.`,
      )
    }

    return isAuthenticated.value
  }

  const initialize = (options?: {
    error?: string | null
    resolveInitialAuth?: boolean
  }) => {
    state.snapshot = buildSnapshot(token.value, user.value)
    if (options?.error !== undefined) {
      rawAuthError.value = options.error
    }
    if (options?.resolveInitialAuth) {
      settleInitialAuth()
    }
  }

  const syncSnapshot = () => {
    state.snapshot = buildSnapshot(token.value, user.value)
  }

  if (options.transport) {
    configureTransport(options.transport)
  }
  syncSnapshot()

  if (!state.hooksRegistered) {
    state.hooksRegistered = true
    nuxtApp.hook('better-convex:auth:refresh', async () => {
      await refreshAuth()
    })
    nuxtApp.hook('better-convex:auth:invalidate', async () => {
      await invalidateAuth({ clearWasAuthenticated: true })
    })
  }

  const engine: SharedAuthEngine = {
    token,
    user,
    pending,
    rawAuthError,
    wasAuthenticated,
    authError,
    isAuthenticated,
    isAnonymous,
    isSessionExpired,
    get client() {
      return state.transport?.client ?? null
    },
    configureTransport,
    syncSnapshot,
    refreshAuth,
    invalidateAuth,
    signOut,
    awaitAuthReady,
    initialize,
  }

  authEngines.set(nuxtApp, engine)
  return engine
}
