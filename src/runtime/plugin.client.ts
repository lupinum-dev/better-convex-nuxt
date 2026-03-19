import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import { ConvexClient } from 'convex/browser'

/**
 * Client-side Convex plugin with SSR token hydration.
 * Manually wires up setAuth() for zero-flash auth on first render.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, useRouter } from '#app'

import type { AuthWaterfall } from './utils/auth-debug'
import {
  buildClientAuthRequestFailureMessage,
  buildClientAuthResponseErrorMessage,
  buildMissingSiteUrlMessage,
} from './utils/auth-errors'
import { decodeUserFromJwt, getJwtTimeUntilExpiryMs } from './utils/convex-shared'
import { createLogger, getLogLevel } from './utils/logger'
import { matchesSkipRoute } from './utils/route-matcher'
import { getConvexRuntimeConfig } from './utils/runtime-config'

interface TokenResponse {
  data?: { token: string } | null
  error?: unknown
}

type AuthClientWithConvex = ReturnType<typeof createAuthClient> & {
  convex: { token: () => Promise<TokenResponse> }
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()
  const publicConvex = config.public.convex as Record<string, unknown> | undefined
  const logLevel = getLogLevel(publicConvex)
  const logger = createLogger(logLevel)
  const endInit = logger.time('plugin:init (client)')
  const debugConfig = publicConvex?.debug as
    | {
        authFlow?: boolean
        clientAuthFlow?: boolean
      }
    | undefined
  const enableClientAuthTrace =
    logLevel === 'debug' && (debugConfig?.authFlow === true || debugConfig?.clientAuthFlow === true)
  const rawAuthLog = logger.auth.bind(logger)
  logger.auth = (event) => {
    rawAuthLog(event)
    if (enableClientAuthTrace) {
      console.log('[BCN_AUTH][client]', {
        phase: event.phase,
        outcome: event.outcome,
        ...event.details,
        error: event.error ? event.error.message : null,
      })
    }
  }
  const convexAuthTraceId = useState<string>(
    'convex:authTraceId',
    () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  )
  const convexDevtoolsInstanceId = useState<string>(
    'convex:devtoolsInstanceId',
    () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  )

  // HMR-safe initialization
  if (nuxtApp.$convex) {
    logger.debug('plugin:init (client) skipped; already initialized', {
      traceId: convexAuthTraceId.value,
    })
    return
  }

  const convexUrl = convexConfig.url
  const authConfig = convexConfig.auth
  const isAuthEnabled = authConfig.enabled
  const resolvedSiteUrl = convexConfig.siteUrl

  if (!convexUrl) {
    logger.auth({ phase: 'init', outcome: 'error', error: new Error('No Convex URL configured') })
    endInit()
    return
  }

  // SSR-hydrated auth state
  const convexToken = useState<string | null>('convex:token')
  const convexUser = useState<unknown>('convex:user')
  const convexAuthWaterfall = useState<AuthWaterfall | null>('convex:authWaterfall')
  const convexAuthError = useState<string | null>('convex:authError')

  // Create Convex WebSocket client
  const client = new ConvexClient(convexUrl)
  let authClient: AuthClientWithConvex | null = null

  // Pending state for auth operations (exposed via useConvexAuth)
  // Start as true - will be set to false after first auth check completes
  const convexPending = useState('convex:pending', () => true)
  let hasResolvedInitialAuth = false
  const resolveInitialAuth = () => {
    if (!hasResolvedInitialAuth) {
      hasResolvedInitialAuth = true
      convexPending.value = false
    }
  }

  logger.auth({
    phase: 'client-init',
    outcome: 'success',
    details: {
      traceId: convexAuthTraceId.value,
      serverRendered: Boolean(nuxtApp.payload?.serverRendered),
      authEnabled: Boolean(isAuthEnabled),
    },
  })

  if (isAuthEnabled && !resolvedSiteUrl) {
    convexAuthError.value = buildMissingSiteUrlMessage(convexUrl)
    convexPending.value = false
    nuxtApp.hook('better-convex:auth:refresh', async () => {
      throw new Error(convexAuthError.value ?? buildMissingSiteUrlMessage(convexUrl))
    })
    logger.auth({
      phase: 'client-init',
      outcome: 'error',
      error: new Error(convexAuthError.value),
      details: { traceId: convexAuthTraceId.value },
    })
  }

  if (isAuthEnabled && resolvedSiteUrl) {
    const authRoute = convexConfig.authRoute
    const authBaseURL =
      typeof window !== 'undefined' ? `${window.location.origin}${authRoute}` : authRoute

    authClient = createAuthClient({
      baseURL: authBaseURL,
      plugins: [convexClient()],
      fetchOptions: { credentials: 'include' },
    }) as AuthClientWithConvex

    // Token cache to avoid redundant fetches
    let lastTokenValidation = Date.now()
    const TOKEN_CACHE_MS = 10000
    const TOKEN_EXPIRY_SAFETY_BUFFER_MS = 30_000
    const skipRoutes = convexConfig.skipAuthRoutes
    const router = useRouter()

    const fetchToken = async ({
      forceRefreshToken,
      signal,
    }: {
      forceRefreshToken: boolean
      signal?: AbortSignal
    }) => {
      const route = router.currentRoute.value
      const routePath = route.path

      logger.auth({
        phase: 'client-fetchToken:start',
        outcome: 'success',
        details: {
          traceId: convexAuthTraceId.value,
          path: routePath,
          forceRefreshToken,
          hasHydratedToken: Boolean(convexToken.value),
          hasHydratedUser: Boolean(convexUser.value),
        },
      })

      if (signal?.aborted) {
        logger.auth({
          phase: 'client-fetchToken:abort',
          outcome: 'skip',
          details: {
            traceId: convexAuthTraceId.value,
            reason: 'signal-aborted-before-start',
            path: routePath,
          },
        })
        resolveInitialAuth()
        return null
      }

      if (route.meta?.skipConvexAuth === true) {
        logger.auth({
          phase: 'client-fetchToken:skip',
          outcome: 'skip',
          details: { traceId: convexAuthTraceId.value, reason: 'page-meta-skip', path: routePath },
        })
        resolveInitialAuth()
        return null
      }

      if (matchesSkipRoute(route.path, skipRoutes)) {
        logger.auth({
          phase: 'client-fetchToken:skip',
          outcome: 'skip',
          details: { traceId: convexAuthTraceId.value, reason: 'skip-auth-route', path: routePath },
        })
        resolveInitialAuth()
        return null
      }

      if (convexToken.value && !forceRefreshToken) {
        lastTokenValidation = Date.now()
        logger.auth({
          phase: 'client-fetchToken:cache',
          outcome: 'success',
          details: { traceId: convexAuthTraceId.value, source: 'hydrated-token', path: routePath },
        })
        resolveInitialAuth()
        return convexToken.value
      }

      const timeSinceValidation = Date.now() - lastTokenValidation
      if (convexToken.value && forceRefreshToken && timeSinceValidation < TOKEN_CACHE_MS) {
        const tokenTimeUntilExpiryMs = getJwtTimeUntilExpiryMs(convexToken.value)
        const canReuseToken =
          tokenTimeUntilExpiryMs === null ||
          (tokenTimeUntilExpiryMs > TOKEN_EXPIRY_SAFETY_BUFFER_MS &&
            timeSinceValidation <
              Math.min(TOKEN_CACHE_MS, tokenTimeUntilExpiryMs - TOKEN_EXPIRY_SAFETY_BUFFER_MS))

        if (canReuseToken) {
          logger.auth({
            phase: 'client-fetchToken:cache',
            outcome: 'success',
            details: {
              traceId: convexAuthTraceId.value,
              source: 'recent-token-cache',
              ageMs: timeSinceValidation,
              path: routePath,
            },
          })
          resolveInitialAuth()
          return convexToken.value
        }

        if (
          tokenTimeUntilExpiryMs !== null &&
          tokenTimeUntilExpiryMs <= TOKEN_EXPIRY_SAFETY_BUFFER_MS
        ) {
          logger.auth({
            phase: 'client-fetchToken:cache',
            outcome: 'skip',
            details: {
              traceId: convexAuthTraceId.value,
              reason: 'token-expiring',
              timeUntilExpiryMs: tokenTimeUntilExpiryMs,
              path: routePath,
            },
          })
        }
      }

      const wasServerRendered = !!nuxtApp.payload?.serverRendered
      if (wasServerRendered && !convexToken.value && !convexUser.value && !forceRefreshToken) {
        logger.auth({
          phase: 'client-fetchToken:skip',
          outcome: 'skip',
          details: {
            traceId: convexAuthTraceId.value,
            reason: 'ssr-rendered-no-hydrated-session',
            path: routePath,
          },
        })
        resolveInitialAuth()
        return null
      }

      try {
        logger.auth({
          phase: 'client-fetchToken:request',
          outcome: 'success',
          details: {
            traceId: convexAuthTraceId.value,
            endpoint: `${authRoute}/convex/token`,
            path: routePath,
          },
        })
        const response = await authClient!.convex.token()

        if (signal?.aborted) {
          logger.auth({
            phase: 'client-fetchToken:abort',
            outcome: 'skip',
            details: {
              traceId: convexAuthTraceId.value,
              reason: 'signal-aborted-after-request',
              path: routePath,
            },
          })
          resolveInitialAuth()
          return null
        }

        if (response.error || !response.data?.token) {
          convexToken.value = null
          convexUser.value = null

          if (response.error) {
            const errorMsg =
              typeof response.error === 'object' &&
              response.error !== null &&
              'message' in response.error
                ? String((response.error as { message: unknown }).message)
                : 'Authentication failed'
            convexAuthError.value = buildClientAuthResponseErrorMessage(errorMsg)
          } else {
            convexAuthError.value = null
          }

          logger.auth({
            phase: 'client-fetchToken:response',
            outcome: 'miss',
            details: {
              traceId: convexAuthTraceId.value,
              path: routePath,
              hasError: Boolean(response.error),
            },
          })
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

        logger.auth({
          phase: 'client-fetchToken:response',
          outcome: 'success',
          details: {
            traceId: convexAuthTraceId.value,
            path: routePath,
            userHydrated: Boolean(convexUser.value),
          },
        })

        resolveInitialAuth()
        return token
      } catch (e) {
        if (signal?.aborted) {
          logger.auth({
            phase: 'client-fetchToken:abort',
            outcome: 'skip',
            details: {
              traceId: convexAuthTraceId.value,
              reason: 'signal-aborted-after-error',
              path: routePath,
            },
          })
          resolveInitialAuth()
          return null
        }

        convexToken.value = null
        convexUser.value = null
        convexAuthError.value = buildClientAuthRequestFailureMessage(e)
        logger.auth({
          phase: 'client-fetchToken:response',
          outcome: 'error',
          details: { traceId: convexAuthTraceId.value, path: routePath },
          error: e instanceof Error ? e : new Error('Authentication request failed'),
        })
        resolveInitialAuth()
        return null
      }
    }

    client.setAuth(fetchToken, (isAuthenticated) => {
      logger.auth({
        phase: 'client-setAuth',
        outcome: 'success',
        details: {
          traceId: convexAuthTraceId.value,
          state: isAuthenticated ? 'authenticated' : 'unauthenticated',
          hasToken: Boolean(convexToken.value),
          hasUser: Boolean(convexUser.value),
        },
      })
    })

    nuxtApp.hook('better-convex:auth:refresh', async () => {
      logger.auth({
        phase: 'client-refresh',
        outcome: 'success',
        details: {
          traceId: convexAuthTraceId.value,
        },
      })
      // Reset cache timestamps to force fresh fetch
      lastTokenValidation = 0

      await new Promise<void>((resolve) => {
        client.setAuth(fetchToken, (_isAuthenticated) => {
          resolve()
        })
      })

      if (convexAuthError.value) {
        throw new Error(convexAuthError.value)
      }
      if (!convexToken.value) {
        throw new Error('Authentication refresh completed without a token')
      }
    })

    // NOTE: We intentionally do NOT call authClient.useSession() here.
    // That would add an extra /get-session round trip on top of /convex/token.
    // We keep the client auth path to a single token exchange and decode user info
    // directly from the JWT.
    //
    // Login/logout detection:
    // - LOGIN: User refreshes page or navigates after login → token is fetched naturally
    // - LOGOUT: Use the signOut() helper from useConvexAuth() which clears local
    //           Convex state and signs out from Better Auth
    //
    // If you need reactive session watching, use authClient.useSession() in your component,
    // but be aware it adds an extra API call (~2 Convex queries).
  } else {
    // No auth integration configured - avoid leaving pending=true forever.
    convexPending.value = false
  }

  // Provide clients globally
  nuxtApp.provide('convex', client)
  if (authClient) {
    nuxtApp.provide('auth', authClient)
  }

  // Expose for debugging (dev only)
  if (typeof window !== 'undefined' && import.meta.dev) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__convex_client__ = client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (authClient) (window as any).__auth_client__ = authClient

    // Setup DevTools bridge in dev mode
    void import('./devtools/bridge-setup').then(({ setupDevToolsBridge }) => {
      void setupDevToolsBridge(
        client,
        convexToken,
        convexUser,
        convexAuthWaterfall,
        convexDevtoolsInstanceId.value,
      )
    })
  }

  endInit()

  // Log initial auth state if hydrated from SSR
  if (convexToken.value) {
    logger.auth({ phase: 'hydrate', outcome: 'success', details: { source: 'ssr' } })
  } else if (isAuthEnabled) {
    logger.auth({
      phase: 'hydrate',
      outcome: 'miss',
      details: {
        traceId: convexAuthTraceId.value,
        source: 'client-init',
      },
    })
  } else {
    logger.debug('Client initialized (auth disabled)')
  }
})
