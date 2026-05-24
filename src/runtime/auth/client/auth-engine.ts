/**
 * Centralized auth state machine for @lupinum/trellis.
 *
 * The engine owns reactive auth state and commits it atomically, while the
 * transport owns token fetching. That split keeps token/user/error writes in
 * one place and lets the engine discard stale transport results safely.
 *
 * Reading order for the client auth flow:
 * 1. `plugin.client.ts` creates the engine
 * 2. the plugin configures the transport
 * 3. Convex pulls tokens through `fetchTokenForConvex`
 * 4. the transport returns a `ClientAuthStateResult`
 * 5. the engine commits or discards it based on `operationId`
 *
 * @module auth-engine
 */
import type { createAuthClient } from 'better-auth/vue'
import { computed, type ComputedRef, type Ref } from 'vue'

import { AUTH_REFRESH_TIMEOUT_MS } from '../../utils/constants.js'
import type { ConvexAuthChangedPayload, AuthSessionUser } from '../../utils/types.js'
import { waitForPendingClear } from '../shared/auth-pending.js'
import {
  buildAuthSnapshot,
  createAuthChangedPayload,
  hasAuthSnapshotChanged,
  isCurrentAuthOperation,
  type AuthSnapshot,
} from './auth-engine-state.js'

type AuthClient = ReturnType<typeof createAuthClient>
export type AuthTrigger =
  | 'convex-set-auth'
  | 'manual-refresh'
  | 'auth-action'
  | 'post-signout'
  | 'invalidate'
  | 'bootstrap'
  | 'unknown'

/** Minimal app interface for hook registration and emission. */
interface RuntimeHookApp {
  hook(
    event: 'trellis:auth:refresh' | 'trellis:auth:invalidate',
    fn: () => void | Promise<void>,
  ): () => void
  callHook?: (event: 'trellis:auth:changed', payload: ConvexAuthChangedPayload) => unknown
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
  | { token: string; user: AuthSessionUser; error: null; source: AuthSource; onCommit?: () => void }
  | { token: null; user: null; error: string | null; source: AuthSource; onCommit?: () => void }

/** Callback signature used by ConvexClient.setAuth(). */
type ConvexFetchToken = (input: {
  forceRefreshToken: boolean
  signal?: AbortSignal
  trigger?: AuthTrigger
}) => Promise<string | null>

interface AuthStateChangeMeta {
  trigger?: AuthTrigger
}

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
    trigger?: AuthTrigger
  }) => Promise<ClientAuthStateResult>
  /** Wire fetchToken into the ConvexClient. Called once at startup. */
  install: (
    fetchToken: ConvexFetchToken,
    onChange: (isAuthenticated: boolean, meta?: AuthStateChangeMeta) => void,
  ) => void
  /** Re-authenticate by calling setAuth with forceRefreshToken. */
  refresh: (
    fetchToken: ConvexFetchToken,
    onChange: (isAuthenticated: boolean, meta?: AuthStateChangeMeta) => void,
    options?: { trigger?: AuthTrigger },
  ) => Promise<void>
  /** Clear the ConvexClient's auth state. */
  invalidate: () => Promise<void>
}

interface AuthEngineState {
  transport: AuthTransport | null
  refreshPromise: Promise<void> | null
  signOutPromise: Promise<void> | null
  operationId: number
  pendingOperationId: number | null
  snapshot: AuthSnapshot
  hooksRegistered: boolean
}

export interface SharedAuthEngine {
  token: Readonly<Ref<string | null>>
  user: Readonly<Ref<AuthSessionUser | null>>
  pending: Readonly<Ref<boolean>>
  rawAuthError: Readonly<Ref<string | null>>
  wasAuthenticated: Readonly<Ref<boolean>>
  authError: ComputedRef<Error | null>
  isAuthenticated: ComputedRef<boolean>
  isAnonymous: ComputedRef<boolean>
  isSessionExpired: ComputedRef<boolean>
  readonly client: AuthClient | null
  configureTransport: (transport: AuthTransport | null) => void
  refreshAuth: () => Promise<void>
  invalidateAuth: (options?: {
    clearWasAuthenticated?: boolean
    preservePending?: boolean
  }) => Promise<void>
  signOut: () => Promise<void>
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
  initialize: (options?: { error?: string | null; resolveInitialAuth?: boolean }) => void
}

export interface CreateSharedAuthEngineOptions {
  nuxtApp: RuntimeHookApp
  token: Ref<string | null>
  user: Ref<AuthSessionUser | null>
  pending: Ref<boolean>
  rawAuthError: Ref<string | null>
  wasAuthenticated: Ref<boolean>
  transport?: AuthTransport | null
  onSetAuthState?: (isAuthenticated: boolean, meta?: AuthStateChangeMeta) => void
  resolveInitialAuth?: () => void
}

// Store on nuxtApp directly instead of module-level WeakMaps so that Vite SSR
// module duplication (common with symlinked file: deps) cannot split the
// write-side (plugin) from the read-side (composable) into separate scopes.
const AUTH_ENGINE_KEY = '__trellis_auth_engine__' as const
const AUTH_ENGINE_STATE_KEY = '__trellis_auth_engine_state__' as const

type NuxtAppStore = Record<string, unknown>

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error,
): Promise<T> {
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

function getEngineState(
  nuxtApp: object,
  token: Ref<string | null>,
  user: Ref<AuthSessionUser | null>,
): AuthEngineState {
  const store = nuxtApp as NuxtAppStore
  const existing = store[AUTH_ENGINE_STATE_KEY] as AuthEngineState | undefined
  if (existing) {
    return existing
  }

  const created: AuthEngineState = {
    transport: null,
    refreshPromise: null,
    signOutPromise: null,
    operationId: 0,
    pendingOperationId: null,
    snapshot: buildAuthSnapshot(token.value, user.value),
    hooksRegistered: false,
  }
  store[AUTH_ENGINE_STATE_KEY] = created
  return created
}

export function getSharedAuthEngine(nuxtApp: object): SharedAuthEngine {
  const engine = (nuxtApp as NuxtAppStore)[AUTH_ENGINE_KEY] as SharedAuthEngine | undefined
  if (!engine) {
    throw new Error(
      '[trellis] Auth engine not initialized. ' +
        'Ensure the Convex client plugin runs before composables.',
    )
  }
  return engine
}

export function hasSharedAuthEngine(nuxtApp: object): boolean {
  return Boolean((nuxtApp as NuxtAppStore)[AUTH_ENGINE_KEY])
}

export function createSharedAuthEngine(options: CreateSharedAuthEngineOptions): SharedAuthEngine {
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

  const existingEngine = (nuxtApp as unknown as NuxtAppStore)[AUTH_ENGINE_KEY] as
    | SharedAuthEngine
    | undefined
  if (existingEngine) {
    if (import.meta.dev) {
      console.warn(
        '[trellis] createSharedAuthEngine() called more than once for the same Nuxt app. Reusing the existing engine.',
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

  // These helpers are the only paths that mutate token/user/error refs.
  const emitIfChanged = (nextSnapshot: AuthSnapshot) => {
    const previousSnapshot = state.snapshot
    state.snapshot = nextSnapshot

    if (!hasAuthSnapshotChanged(previousSnapshot, nextSnapshot)) {
      return
    }

    const payload: ConvexAuthChangedPayload = createAuthChangedPayload(
      previousSnapshot,
      nextSnapshot,
    )
    if (!nuxtApp.callHook) {
      return
    }

    void Promise.resolve(nuxtApp.callHook('trellis:auth:changed', payload)).catch(
      (error: unknown) => {
        console.error('[trellis] Error in trellis:auth:changed hook handler:', error)
      },
    )
  }

  const commitAuthenticated = (nextToken: string, nextUser: AuthSessionUser) => {
    token.value = nextToken
    user.value = nextUser
    rawAuthError.value = null
    wasAuthenticated.value = true
    emitIfChanged(buildAuthSnapshot(nextToken, nextUser))
  }

  const commitUnauthenticated = (
    nextError: string | null,
    options?: {
      clearWasAuthenticated?: boolean
      emit?: boolean
    },
  ) => {
    token.value = null
    user.value = null
    rawAuthError.value = nextError
    if (options?.clearWasAuthenticated) {
      wasAuthenticated.value = false
    }

    const nextSnapshot = buildAuthSnapshot(null, null)
    if (options?.emit === false) {
      state.snapshot = nextSnapshot
      return
    }
    emitIfChanged(nextSnapshot)
  }

  const settleInitialAuth = () => {
    resolveInitialAuth?.()
    if (state.pendingOperationId === null) {
      pending.value = false
    }
  }

  const beginPendingOperation = (operationId: number) => {
    state.pendingOperationId = operationId
    pending.value = true
  }

  const clearPendingOperation = (operationId: number) => {
    if (state.pendingOperationId !== operationId) {
      return
    }

    state.pendingOperationId = null
    pending.value = false
  }

  const clearPendingState = () => {
    state.pendingOperationId = null
    pending.value = false
  }

  // Convex calls this whenever it needs the current auth token.
  const fetchTokenForConvex: ConvexFetchToken = async (input) => {
    if (!state.transport) {
      settleInitialAuth()
      return null
    }

    const operationId = state.operationId
    const result = await state.transport.fetchAuthState(input)
    if (!isCurrentAuthOperation(operationId, state.operationId)) {
      // A newer refresh, invalidate, signOut, or transport swap already won.
      settleInitialAuth()
      return null
    }

    if (result.token !== null) {
      commitAuthenticated(result.token, result.user)
      settleInitialAuth()
      try {
        result.onCommit?.()
      } catch (error) {
        console.error('[trellis] Error in auth transport onCommit callback:', error)
      }
      return result.token
    }

    commitUnauthenticated(result.error, { emit: true })
    settleInitialAuth()
    return null
  }

  const onTransportAuthStateChange = (authenticated: boolean, meta?: AuthStateChangeMeta) => {
    onSetAuthState?.(authenticated, meta)
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

  // Refresh re-runs the full transport flow and invalidates older results.
  const refreshAuth = async (options?: { trigger?: AuthTrigger }): Promise<void> => {
    if (state.refreshPromise) {
      return state.refreshPromise
    }

    if (!state.transport) {
      const message = rawAuthError.value ?? 'Convex auth client is not initialized'
      commitUnauthenticated(message, { emit: false })
      clearPendingState()
      throw new Error(message)
    }

    const transport = state.transport
    state.refreshPromise = (async () => {
      rawAuthError.value = null
      const operationId = ++state.operationId
      beginPendingOperation(operationId)

      try {
        await withTimeout(
          transport.refresh(fetchTokenForConvex, onTransportAuthStateChange, {
            trigger: options?.trigger ?? 'manual-refresh',
          }),
          AUTH_REFRESH_TIMEOUT_MS,
          () => {
            if (import.meta.dev) {
              console.warn(
                `[trellis] Auth refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms. Check auth configuration.`,
              )
            }
            return new Error(`Authentication refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms`)
          },
        )

        if (!isCurrentAuthOperation(operationId, state.operationId)) {
          return
        }

        if (rawAuthError.value) {
          throw new Error(rawAuthError.value)
        }

        return
      } catch (error) {
        if (!isCurrentAuthOperation(operationId, state.operationId)) {
          if (import.meta.dev) {
            console.debug(
              '[trellis] Discarding stale refresh error (superseded by newer operation):',
              error,
            )
          }
          return
        }

        const message = error instanceof Error ? error.message : String(error)
        commitUnauthenticated(message)
        throw error
      } finally {
        clearPendingOperation(operationId)
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
      clearPendingState()
    }

    if (!state.transport) {
      return
    }

    await state.transport.invalidate()
  }

  // Sign-out is fail-closed: clear local auth first, then clean up upstream state.
  const signOut = async (): Promise<void> => {
    if (state.signOutPromise) {
      return state.signOutPromise
    }

    const transport = state.transport
    const client = transport?.client ?? null
    state.signOutPromise = (async () => {
      rawAuthError.value = null
      const operationId = ++state.operationId
      beginPendingOperation(operationId)
      commitUnauthenticated(null, { clearWasAuthenticated: true })

      let firstError: unknown = null
      const captureCleanupError = (error: unknown, phase: 'invalidate' | 'signOut') => {
        if (firstError === null) {
          firstError = error
          return
        }

        console.error(`[trellis] Additional auth signOut ${phase} error:`, error)
      }

      try {
        if (transport) {
          try {
            await transport.invalidate()
          } catch (error) {
            captureCleanupError(error, 'invalidate')
          }
        }

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
        clearPendingOperation(operationId)
        state.signOutPromise = null
      }
    })()

    return state.signOutPromise
  }

  const awaitAuthReady = async (options?: { timeoutMs?: number }): Promise<boolean> => {
    if (!import.meta.client) {
      return isAuthenticated.value
    }

    await waitForPendingClear(pending, {
      timeoutMs: options?.timeoutMs ?? AUTH_REFRESH_TIMEOUT_MS,
    })

    if (import.meta.dev && !isAuthenticated.value && pending.value) {
      console.warn(
        `[trellis] Auth state did not settle within ${options?.timeoutMs ?? AUTH_REFRESH_TIMEOUT_MS}ms. Check auth configuration.`,
      )
    }

    return isAuthenticated.value
  }

  const initialize = (options?: { error?: string | null; resolveInitialAuth?: boolean }) => {
    state.snapshot = buildAuthSnapshot(token.value, user.value)
    if (options?.error !== undefined) {
      rawAuthError.value = options.error
    }
    if (options?.resolveInitialAuth) {
      settleInitialAuth()
    }
  }

  if (options.transport) {
    configureTransport(options.transport)
  }
  state.snapshot = buildAuthSnapshot(token.value, user.value)

  if (!state.hooksRegistered) {
    state.hooksRegistered = true
    nuxtApp.hook('trellis:auth:refresh', async () => {
      await refreshAuth({ trigger: 'manual-refresh' })
    })
    nuxtApp.hook('trellis:auth:invalidate', async () => {
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
    refreshAuth,
    invalidateAuth,
    signOut,
    awaitAuthReady,
    initialize,
  }

  ;(nuxtApp as unknown as NuxtAppStore)[AUTH_ENGINE_KEY] = engine
  return engine
}
