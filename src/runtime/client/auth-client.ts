import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import type { Ref } from 'vue'
import type { Router } from 'vue-router'

interface MinimalNuxtApp {
  payload?: { serverRendered?: boolean }
  hook(event: string, fn: (...args: unknown[]) => unknown): void
}

import {
  buildClientAuthRequestFailureMessage,
  buildClientAuthResponseErrorMessage,
} from '../utils/auth-errors'
import { TOKEN_CACHE_MS, TOKEN_EXPIRY_SAFETY_BUFFER_MS } from '../utils/constants'
import { decodeUserFromJwt, getJwtTimeUntilExpiryMs } from '../utils/convex-shared'
import type { Logger } from '../utils/logger'
import { matchesSkipRoute } from '../utils/route-matcher'

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
  convexAuthError: Ref<string | null>
  resolveInitialAuth: () => void
  logger: Logger
  nuxtApp: MinimalNuxtApp
  router: Router
  traceId: string
}

/**
 * Creates the Better Auth client and wires up token fetching with setAuth().
 * Includes in-flight promise dedup to prevent race conditions.
 */
export function initAuthClient(
  convexClientInstance: ConvexClient,
  options: AuthClientOptions,
): AuthClientWithConvex {
  const {
    baseURL,
    authRoute,
    skipRoutes,
    convexToken,
    convexUser,
    convexAuthError,
    resolveInitialAuth,
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
  let inflightFetch: Promise<string | null> | null = null

  const doFetchToken = async ({
    forceRefreshToken,
    signal,
  }: {
    forceRefreshToken: boolean
    signal?: AbortSignal
  }): Promise<string | null> => {
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
        hasHydratedUser: Boolean(convexUser.value),
      },
    })

    if (signal?.aborted) {
      logger.auth({ phase: 'client-fetchToken:abort', outcome: 'skip', details: { traceId, reason: 'signal-aborted-before-start', path: routePath } })
      resolveInitialAuth()
      return null
    }

    if (route?.meta?.skipConvexAuth === true) {
      logger.auth({ phase: 'client-fetchToken:skip', outcome: 'skip', details: { traceId, reason: 'page-meta-skip', path: routePath } })
      resolveInitialAuth()
      return null
    }

    if (matchesSkipRoute(routePath, skipRoutes)) {
      logger.auth({ phase: 'client-fetchToken:skip', outcome: 'skip', details: { traceId, reason: 'skip-auth-route', path: routePath } })
      resolveInitialAuth()
      return null
    }

    if (convexToken.value && !forceRefreshToken) {
      lastTokenValidation = Date.now()
      logger.auth({ phase: 'client-fetchToken:cache', outcome: 'success', details: { traceId, source: 'hydrated-token', path: routePath } })
      resolveInitialAuth()
      return convexToken.value
    }

    const timeSinceValidation = Date.now() - lastTokenValidation
    if (convexToken.value && forceRefreshToken && timeSinceValidation < TOKEN_CACHE_MS) {
      const tokenTimeUntilExpiryMs = getJwtTimeUntilExpiryMs(convexToken.value)
      const canReuseToken =
        tokenTimeUntilExpiryMs === null ||
        (tokenTimeUntilExpiryMs > TOKEN_EXPIRY_SAFETY_BUFFER_MS &&
          timeSinceValidation < Math.min(TOKEN_CACHE_MS, tokenTimeUntilExpiryMs - TOKEN_EXPIRY_SAFETY_BUFFER_MS))

      if (canReuseToken) {
        logger.auth({ phase: 'client-fetchToken:cache', outcome: 'success', details: { traceId, source: 'recent-token-cache', ageMs: timeSinceValidation, path: routePath } })
        resolveInitialAuth()
        return convexToken.value
      }
    }

    const wasServerRendered = !!(nuxtApp.payload?.serverRendered)
    if (wasServerRendered && !convexToken.value && !convexUser.value && !forceRefreshToken) {
      logger.auth({ phase: 'client-fetchToken:skip', outcome: 'skip', details: { traceId, reason: 'ssr-rendered-no-hydrated-session', path: routePath } })
      resolveInitialAuth()
      return null
    }

    try {
      logger.auth({ phase: 'client-fetchToken:request', outcome: 'success', details: { traceId, endpoint: `${authRoute}/convex/token`, path: routePath } })
      const response = await authClient.convex.token()

      if (signal?.aborted) {
        logger.auth({ phase: 'client-fetchToken:abort', outcome: 'skip', details: { traceId, reason: 'signal-aborted-after-request', path: routePath } })
        resolveInitialAuth()
        return null
      }

      if (response.error || !response.data?.token) {
        convexToken.value = null
        convexUser.value = null

        if (response.error) {
          const errorMsg =
            typeof response.error === 'object' && response.error !== null && 'message' in response.error
              ? String((response.error as { message: unknown }).message)
              : 'Authentication failed'
          convexAuthError.value = buildClientAuthResponseErrorMessage(errorMsg)
        } else {
          convexAuthError.value = null
        }

        logger.auth({ phase: 'client-fetchToken:response', outcome: 'miss', details: { traceId, path: routePath, hasError: Boolean(response.error) } })
        resolveInitialAuth()
        return null
      }

      const token = response.data.token
      convexToken.value = token
      convexAuthError.value = null
      lastTokenValidation = Date.now()

      if (!convexUser.value) {
        convexUser.value = decodeUserFromJwt(token)
      }

      logger.auth({ phase: 'client-fetchToken:response', outcome: 'success', details: { traceId, path: routePath, userHydrated: Boolean(convexUser.value) } })
      resolveInitialAuth()
      return token
    } catch (e) {
      if (signal?.aborted) {
        logger.auth({ phase: 'client-fetchToken:abort', outcome: 'skip', details: { traceId, reason: 'signal-aborted-after-error', path: routePath } })
        resolveInitialAuth()
        return null
      }

      convexToken.value = null
      convexUser.value = null
      convexAuthError.value = buildClientAuthRequestFailureMessage(e)
      logger.auth({
        phase: 'client-fetchToken:response',
        outcome: 'error',
        details: { traceId, path: routePath },
        error: e instanceof Error ? e : new Error('Authentication request failed'),
      })
      resolveInitialAuth()
      return null
    }
  }

  const fetchToken = async (opts: { forceRefreshToken: boolean; signal?: AbortSignal }): Promise<string | null> => {
    if (inflightFetch) return inflightFetch
    inflightFetch = doFetchToken(opts)
    try {
      return await inflightFetch
    } finally {
      inflightFetch = null
    }
  }

  convexClientInstance.setAuth(fetchToken, (isAuthenticated) => {
    logger.auth({
      phase: 'client-setAuth',
      outcome: 'success',
      details: { traceId, state: isAuthenticated ? 'authenticated' : 'unauthenticated', hasToken: Boolean(convexToken.value), hasUser: Boolean(convexUser.value) },
    })
  })

  nuxtApp.hook('better-convex:auth:refresh', async () => {
    logger.auth({ phase: 'client-refresh', outcome: 'success', details: { traceId } })
    lastTokenValidation = 0

    await new Promise<void>((resolve) => {
      convexClientInstance.setAuth(fetchToken, () => resolve())
    })

    if (convexAuthError.value) {
      throw new Error(convexAuthError.value)
    }
    if (!convexToken.value) {
      throw new Error('Authentication refresh completed without a token')
    }
  })

  if (typeof window !== 'undefined' && import.meta.dev) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__auth_client__ = authClient
  }

  return authClient
}
