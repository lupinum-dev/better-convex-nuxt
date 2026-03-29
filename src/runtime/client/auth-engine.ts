import type { createAuthClient } from 'better-auth/vue'
import { computed, type ComputedRef, type Ref } from 'vue'

import { AUTH_REFRESH_TIMEOUT_MS } from '../utils/constants'
import { waitForPendingClear } from '../utils/auth-pending'
import type {
  ConvexAuthChangedPayload,
  ConvexUser,
} from '../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

interface RuntimeHookApp {
  hook(event: 'better-convex:auth:refresh', fn: () => void | Promise<void>): () => void
  hook(event: 'better-convex:auth:invalidate', fn: () => void | Promise<void>): () => void
  callHook?: (event: 'convex:auth:changed', payload: ConvexAuthChangedPayload) => Promise<unknown>
}

export interface ClientAuthStateResult {
  token: string | null
  user: ConvexUser | null
  error: string | null
  source: 'skip' | 'hydrated-token' | 'recent-token-cache' | 'exchange'
}

type ConvexFetchToken = (input: {
  forceRefreshToken: boolean
  signal?: AbortSignal
}) => Promise<string | null>

export interface AuthTransport {
  client: AuthClient | null
  fetchAuthState: (input: {
    forceRefreshToken: boolean
    signal?: AbortSignal
  }) => Promise<ClientAuthStateResult>
  install: (fetchToken: ConvexFetchToken, onChange: (isAuthenticated: boolean) => void) => void
  refresh: (fetchToken: ConvexFetchToken, onChange: (isAuthenticated: boolean) => void) => Promise<void>
  invalidate: () => Promise<void>
}

interface AuthSnapshot {
  isAuthenticated: boolean
  user: ConvexUser | null
  userId: string | null
}

interface AuthEngineState {
  transport: AuthTransport | null
  refreshPromise: Promise<void> | null
  signOutPromise: Promise<void> | null
  operationId: number
  snapshot: AuthSnapshot
  hooksRegistered: boolean
}

export interface SharedAuthEngine {
  token: Ref<string | null>
  user: Ref<ConvexUser | null>
  pending: Ref<boolean>
  rawAuthError: Ref<string | null>
  wasAuthenticated: Ref<boolean>
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

export function getOrCreateSharedAuthEngine(
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

  const state = getEngineState(nuxtApp, token, user)
  const authError = computed(() => (rawAuthError.value ? new Error(rawAuthError.value) : null))
  const isAuthenticated = computed(() => Boolean(token.value && user.value))
  const isAnonymous = computed(() => !pending.value && !isAuthenticated.value)
  const isSessionExpired = computed(
    () => !pending.value && !isAuthenticated.value && wasAuthenticated.value,
  )

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
    void nuxtApp.callHook?.('convex:auth:changed', payload)
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

  const fetchTokenForConvex: ConvexFetchToken = async (input) => {
    if (!state.transport) {
      settleInitialAuth()
      return null
    }

    const operationId = state.operationId
    const result = await state.transport.fetchAuthState(input)
    if (operationId !== state.operationId) {
      settleInitialAuth()
      return null
    }

    if (result.token && result.user) {
      commitAuthenticated(result.token, result.user)
      settleInitialAuth()
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
    state.transport = transport
    if (transport) {
      transport.install(fetchTokenForConvex, onTransportAuthStateChange)
    }
  }

  const refreshAuth = async (): Promise<void> => {
    if (state.refreshPromise) {
      return state.refreshPromise
    }

    if (!state.transport) {
      const message = rawAuthError.value ?? 'Convex auth client is not initialized'
      commitUnauthenticated(message, { emit: false })
      pending.value = false
      throw new Error(message)
    }

    state.refreshPromise = (async () => {
      pending.value = true
      rawAuthError.value = null
      const operationId = ++state.operationId

      try {
        await withTimeout(
          state.transport.refresh(fetchTokenForConvex, onTransportAuthStateChange),
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

        const message = rawAuthError.value ?? 'Authentication refresh completed without a token'
        commitUnauthenticated(message)
        throw new Error(message)
      } catch (error) {
        if (operationId !== state.operationId) {
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

  const signOut = async (): Promise<void> => {
    if (state.signOutPromise) {
      return state.signOutPromise
    }

    state.signOutPromise = (async () => {
      pending.value = true
      rawAuthError.value = null
      commitUnauthenticated(null, { clearWasAuthenticated: true })
      ++state.operationId

      let firstError: unknown = null

      try {
        if (state.transport) {
          try {
            await state.transport.invalidate()
          } catch (error) {
            firstError ??= error
          }
        }

        const client = state.transport?.client ?? null
        if (client) {
          try {
            await client.signOut()
          } catch (error) {
            firstError ??= error
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

  return {
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
}
