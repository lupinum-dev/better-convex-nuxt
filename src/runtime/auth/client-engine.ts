import type { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import { nextTick } from 'vue'
import type { Ref } from 'vue'

import { clearNuxtData } from '#app'

import {
  buildClientAuthRequestFailureMessage,
  buildClientAuthResponseErrorMessage,
  buildMissingSiteUrlMessage,
} from '../utils/auth-errors'
import { clearAuthSubscriptions, getSubscriptionCache } from '../utils/convex-cache'
import { decodeUserFromJwt, getJwtTimeUntilExpiryMs } from '../utils/convex-shared'
import type { Logger } from '../utils/logger'
import { matchesSkipRoute } from '../utils/route-matcher'
import type { ConvexUser } from '../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>
interface TokenResponse {
  data?: { token: string } | null
  error?: unknown
}

export type AuthClientWithConvex = AuthClient & {
  convex: { token: (options?: unknown) => Promise<TokenResponse> }
}

type AuthEngineNuxtApp = {
  _convexRefreshAuthPromise?: Promise<void> | null
  callHook: (name: 'better-convex:auth:refresh') => Promise<void>
  hook: (name: 'better-convex:auth:refresh', callback: () => void | Promise<void>) => void
}

type AuthEngineRoute = {
  path: string
  meta?: { skipConvexAuth?: boolean }
}

const TOKEN_CACHE_MS = 10000
const TOKEN_EXPIRY_SAFETY_BUFFER_MS = 30_000
const NULL_TOKEN_CACHE_MS = 5000

export interface ConvexAuthEngineState {
  token: Ref<string | null>
  user: Ref<ConvexUser | null>
  pending: Ref<boolean>
  authError: Ref<string | null>
}

export interface ConvexAuthEngine {
  attachConvexClient: (client: ConvexClient) => void
  signOut: () => Promise<
    ReturnType<AuthClient['signOut']> extends Promise<infer T> ? T | null : null
  >
  refreshAuth: () => Promise<void>
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
}

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (value instanceof Error) return value.message
  if (value && typeof value === 'object' && 'message' in value) {
    return String((value as { message: unknown }).message)
  }
  if (typeof value === 'string' && value.length > 0) return value
  return fallback
}

export function createConvexAuthEngine({
  nuxtApp,
  authClient,
  state,
  logger,
  traceId,
  convexUrl,
  isAuthEnabled = Boolean(authClient),
  authRoute = '/api/auth',
  skipRoutes = [],
  getRoute = () => ({ path: '/', meta: {} }),
  wasServerRendered = () => false,
}: {
  nuxtApp: AuthEngineNuxtApp
  authClient: AuthClientWithConvex | AuthClient | null
  state: ConvexAuthEngineState
  logger?: Pick<Logger, 'auth'>
  traceId?: Ref<string> | (() => string) | string
  convexUrl?: string
  isAuthEnabled?: boolean
  authRoute?: string
  skipRoutes?: string[]
  getRoute?: () => AuthEngineRoute
  wasServerRendered?: () => boolean
}): ConvexAuthEngine {
  let hasResolvedInitialAuth = false
  let lastTokenValidation = Date.now()
  let lastNullTokenCheck = 0
  let authGeneration = 0
  let signOutPromise: ReturnType<ConvexAuthEngine['signOut']> | null = null
  let attachedClient: ConvexClient | null = null
  let authReadyPromise: Promise<boolean> | null = null
  let resolveAuthReady: ((isAuthenticated: boolean) => void) | null = null

  const getTraceId = () => {
    if (!traceId) return undefined
    if (typeof traceId === 'function') return traceId()
    if (typeof traceId === 'string') return traceId
    return traceId.value
  }

  const isActiveGeneration = (generation: number) => generation === authGeneration

  const nextGeneration = () => {
    authGeneration += 1
    return authGeneration
  }

  const resetAuthReady = () => {
    authReadyPromise = new Promise<boolean>((resolve) => {
      resolveAuthReady = resolve
    })
  }

  const settleAuthReady = (isAuthenticated: boolean) => {
    resolveAuthReady?.(isAuthenticated)
    resolveAuthReady = null
    authReadyPromise = Promise.resolve(isAuthenticated)
  }

  const resolveInitialAuth = (generation = authGeneration) => {
    if (isActiveGeneration(generation) && !hasResolvedInitialAuth) {
      hasResolvedInitialAuth = true
      state.pending.value = false
    }
  }

  const logAuth = logger?.auth ?? (() => {})

  const getConvexAuthClient = (): AuthClientWithConvex | null => {
    const maybeAuthClient = authClient as Partial<AuthClientWithConvex> | null
    if (typeof maybeAuthClient?.convex?.token !== 'function') return null
    return maybeAuthClient as AuthClientWithConvex
  }

  const fetchToken = async ({
    forceRefreshToken,
    signal,
  }: {
    forceRefreshToken: boolean
    signal?: AbortSignal
  }) => {
    const operationGeneration = authGeneration
    const route = getRoute()
    const routePath = route.path
    const currentTraceId = getTraceId()

    logAuth({
      phase: 'client-fetchToken:start',
      outcome: 'success',
      details: {
        traceId: currentTraceId,
        path: routePath,
        forceRefreshToken,
        hasHydratedToken: Boolean(state.token.value),
        hasHydratedUser: Boolean(state.user.value),
      },
    })

    if (signal?.aborted) {
      logAuth({
        phase: 'client-fetchToken:abort',
        outcome: 'skip',
        details: {
          traceId: currentTraceId,
          reason: 'signal-aborted-before-start',
          path: routePath,
        },
      })
      return null
    }

    if (route.meta?.skipConvexAuth === true) {
      logAuth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: { traceId: currentTraceId, reason: 'page-meta-skip', path: routePath },
      })
      resolveInitialAuth(operationGeneration)
      return null
    }

    if (matchesSkipRoute(routePath, skipRoutes)) {
      logAuth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: { traceId: currentTraceId, reason: 'skip-auth-route', path: routePath },
      })
      resolveInitialAuth(operationGeneration)
      return null
    }

    if (state.token.value && !forceRefreshToken) {
      lastTokenValidation = Date.now()
      logAuth({
        phase: 'client-fetchToken:cache',
        outcome: 'success',
        details: { traceId: currentTraceId, source: 'hydrated-token', path: routePath },
      })
      resolveInitialAuth(operationGeneration)
      return state.token.value
    }

    const timeSinceValidation = Date.now() - lastTokenValidation
    if (state.token.value && forceRefreshToken && timeSinceValidation < TOKEN_CACHE_MS) {
      const tokenTimeUntilExpiryMs = getJwtTimeUntilExpiryMs(state.token.value)
      if (
        tokenTimeUntilExpiryMs !== null &&
        tokenTimeUntilExpiryMs <= TOKEN_EXPIRY_SAFETY_BUFFER_MS
      ) {
        logAuth({
          phase: 'client-fetchToken:cache',
          outcome: 'skip',
          details: {
            traceId: currentTraceId,
            reason: 'token-expiring',
            timeUntilExpiryMs: tokenTimeUntilExpiryMs,
            path: routePath,
          },
        })
      } else if (
        tokenTimeUntilExpiryMs === null ||
        timeSinceValidation <
          Math.min(
            TOKEN_CACHE_MS,
            Math.max(0, tokenTimeUntilExpiryMs - TOKEN_EXPIRY_SAFETY_BUFFER_MS),
          )
      ) {
        logAuth({
          phase: 'client-fetchToken:cache',
          outcome: 'success',
          details: {
            traceId: currentTraceId,
            source: 'recent-token-cache',
            ageMs: timeSinceValidation,
            path: routePath,
          },
        })
        resolveInitialAuth(operationGeneration)
        return state.token.value
      }
    }

    if (wasServerRendered() && !state.token.value && !state.user.value && !forceRefreshToken) {
      logAuth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: {
          traceId: currentTraceId,
          reason: 'ssr-rendered-no-hydrated-session',
          path: routePath,
        },
      })
      resolveInitialAuth(operationGeneration)
      return null
    }

    const timeSinceNullCheck = Date.now() - lastNullTokenCheck
    if (!state.token.value && timeSinceNullCheck < NULL_TOKEN_CACHE_MS) {
      logAuth({
        phase: 'client-fetchToken:cache',
        outcome: 'miss',
        details: {
          traceId: currentTraceId,
          source: 'negative-cache',
          ageMs: timeSinceNullCheck,
          path: routePath,
        },
      })
      resolveInitialAuth(operationGeneration)
      return null
    }

    const convexAuthClient = getConvexAuthClient()
    if (!convexAuthClient) {
      if (!isActiveGeneration(operationGeneration)) return null
      state.authError.value = buildClientAuthRequestFailureMessage(
        new Error('Better Auth Convex client plugin is unavailable'),
      )
      state.token.value = null
      state.user.value = null
      resolveInitialAuth(operationGeneration)
      return null
    }

    try {
      logAuth({
        phase: 'client-fetchToken:request',
        outcome: 'success',
        details: {
          traceId: currentTraceId,
          endpoint: `${authRoute}/convex/token`,
          path: routePath,
        },
      })
      const response = await convexAuthClient.convex.token({
        fetchOptions: { throw: false },
      })

      if (signal?.aborted) {
        logAuth({
          phase: 'client-fetchToken:abort',
          outcome: 'skip',
          details: {
            traceId: currentTraceId,
            reason: 'signal-aborted-after-request',
            path: routePath,
          },
        })
        return null
      }

      if (!isActiveGeneration(operationGeneration)) {
        logAuth({
          phase: 'client-fetchToken:stale',
          outcome: 'skip',
          details: { traceId: currentTraceId, path: routePath },
        })
        return null
      }

      if (response.error || !response.data?.token) {
        state.token.value = null
        state.user.value = null
        if (response.error) {
          state.authError.value = buildClientAuthResponseErrorMessage(
            getErrorMessage(response.error, 'Authentication failed'),
          )
        } else {
          state.authError.value = null
        }
        lastNullTokenCheck = Date.now()
        logAuth({
          phase: 'client-fetchToken:response',
          outcome: 'miss',
          details: { traceId: currentTraceId, path: routePath, hasError: Boolean(response.error) },
        })
        resolveInitialAuth(operationGeneration)
        return null
      }

      const token = response.data.token
      state.token.value = token
      state.authError.value = null
      lastTokenValidation = Date.now()
      state.user.value = decodeUserFromJwt(token)

      logAuth({
        phase: 'client-fetchToken:response',
        outcome: 'success',
        details: {
          traceId: currentTraceId,
          path: routePath,
          userHydrated: Boolean(state.user.value),
        },
      })
      resolveInitialAuth(operationGeneration)
      return token
    } catch (error) {
      if (signal?.aborted) {
        logAuth({
          phase: 'client-fetchToken:abort',
          outcome: 'skip',
          details: {
            traceId: currentTraceId,
            reason: 'signal-aborted-after-error',
            path: routePath,
          },
        })
        return null
      }

      if (!isActiveGeneration(operationGeneration)) {
        logAuth({
          phase: 'client-fetchToken:stale',
          outcome: 'skip',
          details: {
            traceId: currentTraceId,
            path: routePath,
            reason: 'stale-error',
          },
        })
        return null
      }

      state.token.value = null
      state.user.value = null
      state.authError.value = buildClientAuthRequestFailureMessage(error)
      lastNullTokenCheck = Date.now()
      logAuth({
        phase: 'client-fetchToken:response',
        outcome: 'error',
        details: { traceId: currentTraceId, path: routePath },
        error: error instanceof Error ? error : new Error('Authentication request failed'),
      })
      resolveInitialAuth(operationGeneration)
      return null
    }
  }

  const attachConvexClient = (client: ConvexClient) => {
    attachedClient = client

    if (!isAuthEnabled) {
      state.pending.value = false
      settleAuthReady(true)
      return
    }

    if (!getConvexAuthClient()) {
      state.authError.value = buildMissingSiteUrlMessage(convexUrl ?? 'the configured Convex URL')
      state.pending.value = false
      settleAuthReady(false)
      nuxtApp.hook('better-convex:auth:refresh', async () => {
        throw new Error(state.authError.value ?? buildMissingSiteUrlMessage(convexUrl ?? ''))
      })
      logAuth({
        phase: 'client-init',
        outcome: 'error',
        error: new Error(state.authError.value),
        details: { traceId: getTraceId() },
      })
      return
    }

    resetAuthReady()
    client.setAuth(fetchToken, (isAuthenticated) => {
      if (isAuthenticated) {
        state.authError.value = null
      } else if (state.token.value) {
        state.authError.value = 'Convex authentication token was rejected by the server'
      }
      state.pending.value = false
      settleAuthReady(isAuthenticated)
      logAuth({
        phase: 'client-setAuth',
        outcome: 'success',
        details: {
          traceId: getTraceId(),
          state: isAuthenticated ? 'authenticated' : 'unauthenticated',
          hasToken: Boolean(state.token.value),
          hasUser: Boolean(state.user.value),
        },
      })
    })

    nuxtApp.hook('better-convex:auth:refresh', async () => {
      logAuth({
        phase: 'client-refresh',
        outcome: 'success',
        details: { traceId: getTraceId() },
      })
      lastTokenValidation = 0
      lastNullTokenCheck = 0

      const isAuthenticated = await new Promise<boolean>((resolve) => {
        resetAuthReady()
        client.setAuth(fetchToken, (nextIsAuthenticated) => {
          if (nextIsAuthenticated) {
            state.authError.value = null
          } else if (state.token.value) {
            state.authError.value = 'Convex authentication token was rejected by the server'
          }
          state.pending.value = false
          settleAuthReady(nextIsAuthenticated)
          resolve(nextIsAuthenticated)
        })
      })

      if (state.authError.value) {
        throw new Error(state.authError.value)
      }
      if (!isAuthenticated) {
        state.authError.value = 'Convex authentication did not complete'
        throw new Error(state.authError.value)
      }
      if (!state.token.value) {
        throw new Error('Authentication refresh completed without a token')
      }
    })
  }

  const signOut: ConvexAuthEngine['signOut'] = async () => {
    if (signOutPromise) {
      return signOutPromise
    }

    if (!authClient) {
      const error = new Error(
        '[useConvexAuth] Cannot sign out because Better Auth client is unavailable',
      )
      state.authError.value = error.message
      throw error
    }

    const operationGeneration = nextGeneration()
    state.pending.value = true
    state.authError.value = null

    signOutPromise = (async () => {
      clearAuthSubscriptions(nuxtApp)
      await nextTick()

      const result = await authClient.signOut()
      const maybeError =
        result && typeof result === 'object' && 'error' in result ? result.error : null

      if (maybeError) {
        throw new Error(getErrorMessage(maybeError, 'Sign out failed'))
      }

      if (isActiveGeneration(operationGeneration)) {
        state.token.value = null
        state.user.value = null
        state.authError.value = null
        lastTokenValidation = 0
        lastNullTokenCheck = Date.now()
        settleAuthReady(false)
        attachedClient?.setAuth(
          async () => null,
          () => {},
        )
        clearAuthSubscriptions(nuxtApp)

        // Purge cached Convex query payload so a subsequent session can never read or
        // hydrate the previous user's data. Keys still present in the subscription
        // cache belong to live public (auth:'none') queries and keep their data.
        const liveKeys = new Set(getSubscriptionCache(nuxtApp).keys())
        clearNuxtData((key) => key.startsWith('convex') && !liveKeys.has(key))
      }

      return result
    })()

    try {
      return await signOutPromise
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      if (isActiveGeneration(operationGeneration)) {
        state.authError.value = error.message
      }
      throw error
    } finally {
      if (isActiveGeneration(operationGeneration)) {
        state.pending.value = false
      }
      signOutPromise = null
    }
  }

  const refreshAuth = async (): Promise<void> => {
    if (nuxtApp._convexRefreshAuthPromise) {
      return nuxtApp._convexRefreshAuthPromise
    }

    nuxtApp._convexRefreshAuthPromise = (async () => {
      const operationGeneration = nextGeneration()
      state.pending.value = true
      state.authError.value = null

      try {
        await Promise.race([
          nuxtApp.callHook('better-convex:auth:refresh'),
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => {
              reject(new Error('Authentication refresh timed out after 5 seconds'))
            }, 5000)
          }),
        ])

        if (!isActiveGeneration(operationGeneration)) {
          return
        }
        if (state.token.value) {
          return
        }
        if (state.authError.value) {
          throw new Error(state.authError.value)
        }

        state.authError.value = 'Authentication refresh completed without a token'
        throw new Error(state.authError.value)
      } catch (error) {
        if (isActiveGeneration(operationGeneration)) {
          state.authError.value = getErrorMessage(error, 'Authentication refresh failed')
        }
        throw error
      } finally {
        if (isActiveGeneration(operationGeneration)) {
          state.pending.value = false
        }
        nuxtApp._convexRefreshAuthPromise = null
      }
    })()

    return nuxtApp._convexRefreshAuthPromise
  }

  const awaitAuthReady: ConvexAuthEngine['awaitAuthReady'] = async (options) => {
    if (!isAuthEnabled) return true
    if (!getConvexAuthClient()) return false
    if (!state.token.value) return true

    const timeoutMs = options?.timeoutMs ?? 5_000
    return await Promise.race([
      authReadyPromise ?? Promise.resolve(Boolean(state.token.value)),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), timeoutMs)
      }),
    ])
  }

  return {
    attachConvexClient,
    signOut,
    refreshAuth,
    awaitAuthReady,
  }
}
