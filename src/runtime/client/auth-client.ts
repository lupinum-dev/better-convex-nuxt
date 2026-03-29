import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import type { Ref } from 'vue'
import type { Router } from 'vue-router'

import {
  buildAuthTokenDecodeFailureMessage,
  buildClientAuthRequestFailureMessage,
  buildClientAuthResponseErrorMessage,
} from '../utils/auth-errors'
import {
  TOKEN_CACHE_MS,
  TOKEN_EXPIRY_SAFETY_BUFFER_MS,
} from '../utils/constants'
import {
  decodeUserFromJwt,
  getJwtTimeUntilExpiryMs,
} from '../utils/convex-shared'
import type { Logger } from '../utils/logger'
import { matchesSkipRoute } from '../utils/route-matcher'
import type { ConvexUser } from '../utils/types'
import type {
  AuthTransport,
  ClientAuthStateResult,
} from './auth-engine'

interface MinimalNuxtApp {
  payload?: { serverRendered?: boolean }
}

interface TokenResponse {
  data?: { token: string } | null
  error?: unknown
}

type AuthClientWithConvex = ReturnType<typeof createAuthClient> & {
  convex: { token: () => Promise<TokenResponse> }
}

interface AuthClientOptions {
  baseURL: string
  authRoute: string
  skipRoutes: string[]
  convexToken: Ref<string | null>
  convexUser: Ref<unknown>
  logger: Logger
  nuxtApp: MinimalNuxtApp
  router: Router
  traceId: string
}

function normalizeHydratedUser(user: unknown): ConvexUser | null {
  if (!user || typeof user !== 'object') {
    return null
  }

  const candidate = user as Partial<ConvexUser>
  return typeof candidate.id === 'string' ? (candidate as ConvexUser) : null
}

function buildAuthenticatedResult(
  source: ClientAuthStateResult['source'],
  token: string,
  user: ConvexUser,
): ClientAuthStateResult {
  return {
    token,
    user,
    error: null,
    source,
  }
}

/**
 * Creates the Better Auth client plus a transport that can resolve auth state
 * without mutating Nuxt auth refs directly.
 */
export function initAuthClient(
  convexClientInstance: ConvexClient,
  options: AuthClientOptions,
): AuthTransport {
  const {
    baseURL,
    authRoute,
    skipRoutes,
    convexToken,
    convexUser,
    logger,
    nuxtApp,
    router,
    traceId,
  } = options

  const authClient = createAuthClient({
    baseURL,
    plugins: [convexClient()],
    fetchOptions: { credentials: 'include' },
  }) as AuthClientWithConvex

  let lastTokenValidation = Date.now()
  let inflightFetch: Promise<ClientAuthStateResult> | null = null

  const syncHydratedAuthFromToken = (
    source: 'hydrated-token' | 'recent-token-cache',
    routePath: string,
  ): ClientAuthStateResult => {
    const token = convexToken.value
    if (!token) {
      return {
        token: null,
        user: null,
        error: null,
        source,
      }
    }

    const hydratedUser = normalizeHydratedUser(convexUser.value)
    if (hydratedUser) {
      return buildAuthenticatedResult(source, token, hydratedUser)
    }

    const decodedUser = decodeUserFromJwt(token)
    if (!decodedUser) {
      const error = buildAuthTokenDecodeFailureMessage()
      logger.auth({
        phase: 'client-fetchToken:cache',
        outcome: 'error',
        details: {
          traceId,
          path: routePath,
          source,
          userHydrated: false,
        },
        error: new Error(error),
      })
      return {
        token: null,
        user: null,
        error,
        source,
      }
    }

    return buildAuthenticatedResult(source, token, decodedUser)
  }

  const doFetchAuthState = async ({
    forceRefreshToken,
    signal,
  }: {
    forceRefreshToken: boolean
    signal?: AbortSignal
  }): Promise<ClientAuthStateResult> => {
    const route = router.currentRoute.value
    const routePath = route?.path ?? '/'

    logger.auth({
      phase: 'client-fetchToken:start',
      outcome: 'success',
      details: {
        traceId,
        path: routePath,
        forceRefreshToken,
        hasHydratedToken: Boolean(convexToken.value),
        hasHydratedUser: Boolean(normalizeHydratedUser(convexUser.value)),
      },
    })

    if (signal?.aborted) {
      logger.auth({
        phase: 'client-fetchToken:abort',
        outcome: 'skip',
        details: { traceId, reason: 'signal-aborted-before-start', path: routePath },
      })
      return { token: null, user: null, error: null, source: 'skip' }
    }

    if (route?.meta?.skipConvexAuth === true) {
      logger.auth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: { traceId, reason: 'page-meta-skip', path: routePath },
      })
      return { token: null, user: null, error: null, source: 'skip' }
    }

    if (matchesSkipRoute(routePath, skipRoutes)) {
      logger.auth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: { traceId, reason: 'skip-auth-route', path: routePath },
      })
      return { token: null, user: null, error: null, source: 'skip' }
    }

    if (convexToken.value && !forceRefreshToken) {
      lastTokenValidation = Date.now()
      logger.auth({
        phase: 'client-fetchToken:cache',
        outcome: 'success',
        details: { traceId, source: 'hydrated-token', path: routePath },
      })
      return syncHydratedAuthFromToken('hydrated-token', routePath)
    }

    const timeSinceValidation = Date.now() - lastTokenValidation
    if (convexToken.value && forceRefreshToken && timeSinceValidation < TOKEN_CACHE_MS) {
      const tokenTimeUntilExpiryMs = getJwtTimeUntilExpiryMs(convexToken.value)
      const canReuseToken =
        tokenTimeUntilExpiryMs === null
        || (
          tokenTimeUntilExpiryMs > TOKEN_EXPIRY_SAFETY_BUFFER_MS
          && timeSinceValidation
          < Math.min(TOKEN_CACHE_MS, tokenTimeUntilExpiryMs - TOKEN_EXPIRY_SAFETY_BUFFER_MS)
        )

      if (canReuseToken) {
        logger.auth({
          phase: 'client-fetchToken:cache',
          outcome: 'success',
          details: {
            traceId,
            source: 'recent-token-cache',
            ageMs: timeSinceValidation,
            path: routePath,
          },
        })
        return syncHydratedAuthFromToken('recent-token-cache', routePath)
      }
    }

    const wasServerRendered = Boolean(nuxtApp.payload?.serverRendered)
    if (wasServerRendered && !convexToken.value && !normalizeHydratedUser(convexUser.value) && !forceRefreshToken) {
      logger.auth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: {
          traceId,
          reason: 'ssr-rendered-no-hydrated-session',
          path: routePath,
        },
      })
      return { token: null, user: null, error: null, source: 'skip' }
    }

    try {
      logger.auth({
        phase: 'client-fetchToken:request',
        outcome: 'success',
        details: {
          traceId,
          endpoint: `${authRoute}/convex/token`,
          path: routePath,
        },
      })
      const response = await authClient.convex.token()

      if (signal?.aborted) {
        logger.auth({
          phase: 'client-fetchToken:abort',
          outcome: 'skip',
          details: { traceId, reason: 'signal-aborted-after-request', path: routePath },
        })
        return { token: null, user: null, error: null, source: 'skip' }
      }

      if (response.error || !response.data?.token) {
        const error = response.error
          ? buildClientAuthResponseErrorMessage(
              typeof response.error === 'object'
                && response.error !== null
                && 'message' in response.error
                ? String((response.error as { message: unknown }).message)
                : 'Authentication failed',
            )
          : null

        logger.auth({
          phase: 'client-fetchToken:response',
          outcome: 'miss',
          details: {
            traceId,
            path: routePath,
            hasError: Boolean(response.error),
          },
        })

        return {
          token: null,
          user: null,
          error,
          source: 'exchange',
        }
      }

      const token = response.data.token
      const decodedUser = decodeUserFromJwt(token)
      if (!decodedUser) {
        const error = buildAuthTokenDecodeFailureMessage()
        logger.auth({
          phase: 'client-fetchToken:response',
          outcome: 'error',
          details: {
            traceId,
            path: routePath,
            source: 'exchange',
            userHydrated: false,
          },
          error: new Error(error),
        })
        return {
          token: null,
          user: null,
          error,
          source: 'exchange',
        }
      }

      lastTokenValidation = Date.now()
      logger.auth({
        phase: 'client-fetchToken:response',
        outcome: 'success',
        details: {
          traceId,
          path: routePath,
          userHydrated: true,
        },
      })

      return buildAuthenticatedResult('exchange', token, decodedUser)
    } catch (error) {
      if (signal?.aborted) {
        logger.auth({
          phase: 'client-fetchToken:abort',
          outcome: 'skip',
          details: { traceId, reason: 'signal-aborted-after-error', path: routePath },
        })
        return { token: null, user: null, error: null, source: 'skip' }
      }

      const message = buildClientAuthRequestFailureMessage(error)
      logger.auth({
        phase: 'client-fetchToken:response',
        outcome: 'error',
        details: { traceId, path: routePath },
        error: error instanceof Error ? error : new Error('Authentication request failed'),
      })
      return {
        token: null,
        user: null,
        error: message,
        source: 'exchange',
      }
    }
  }

  const fetchAuthState: AuthTransport['fetchAuthState'] = async (input) => {
    if (inflightFetch) {
      return await inflightFetch
    }

    inflightFetch = doFetchAuthState(input)
    try {
      return await inflightFetch
    } finally {
      inflightFetch = null
    }
  }

  return {
    client: authClient,
    fetchAuthState,
    install(fetchToken, onChange) {
      convexClientInstance.setAuth(fetchToken, onChange)
    },
    async refresh(fetchToken, onChange) {
      lastTokenValidation = 0
      await new Promise<void>((resolve) => {
        convexClientInstance.setAuth(
          (input) => fetchToken({ ...input, forceRefreshToken: true }),
          () => {
            onChange(Boolean(convexToken.value && normalizeHydratedUser(convexUser.value)))
            resolve()
          },
        )
      })
    },
    async invalidate() {
      lastTokenValidation = 0
      inflightFetch = null
      await new Promise<void>((resolve) => {
        convexClientInstance.setAuth(async () => null, () => resolve())
      })
    },
  }
}
