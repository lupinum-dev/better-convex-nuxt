/**
 * Client-side Convex plugin with SSR token hydration.
 * Manually wires up setAuth() for zero-flash auth on first render.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, useRouter } from '#app'
import { watch } from 'vue'
import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import { ConvexClient } from 'convex/browser'
import { createLogger, getLogLevel } from './utils/logger'
import { matchesSkipRoute } from './utils/route-matcher'
import { decodeUserFromJwt } from './utils/convex-shared'
import type { AuthWaterfall } from './devtools/types'

interface TokenResponse {
  data?: { token: string } | null
  error?: unknown
}

type AuthClientWithConvex = ReturnType<typeof createAuthClient> & {
  convex: { token: () => Promise<TokenResponse> }
}

declare module '#app' {
  interface NuxtApp {
    _convexInitialized?: boolean
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = createLogger(logLevel)
  const endInit = logger.time('plugin:init (client)')
  const debugConfig = (config.public.convex?.debug as {
    authFlow?: boolean
    clientAuthFlow?: boolean
  } | undefined)
  const enableClientAuthTrace
    = logLevel === 'debug' && (debugConfig?.authFlow === true || debugConfig?.clientAuthFlow === true)
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

  // HMR-safe initialization
  if (nuxtApp._convexInitialized) {
    logger.debug('plugin:init (client) skipped; already initialized', { traceId: convexAuthTraceId.value })
    return
  }
  nuxtApp._convexInitialized = true

  const convexUrl = config.public.convex?.url as string | undefined
  // Check if auth is explicitly enabled via the auth flag
  const isAuthEnabled = config.public.convex?.auth as boolean | undefined
  const siteUrl = config.public.convex?.siteUrl as string | undefined

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

  // Signal for triggering auth refresh (used by useConvexAuth.refreshAuth())
  const refreshSignal = useState<number>('convex:refreshSignal', () => 0)
  logger.auth({
    phase: 'client-init',
    outcome: 'success',
    details: {
      traceId: convexAuthTraceId.value,
      serverRendered: Boolean(nuxtApp.payload?.serverRendered),
      authEnabled: Boolean(isAuthEnabled),
    },
  })

  if (isAuthEnabled && siteUrl) {
    // Normalize authRoute: ensure leading slash, remove trailing slash
    const rawAuthRoute = (config.public.convex?.authRoute as string | undefined) || '/api/auth'
    const authRoute = (rawAuthRoute.startsWith('/') ? rawAuthRoute : `/${rawAuthRoute}`)
      .replace(/\/+$/, '')
    const authBaseURL =
      typeof window !== 'undefined' ? `${window.location.origin}${authRoute}` : authRoute

    authClient = createAuthClient({
      baseURL: authBaseURL,
      plugins: [convexClient()],
      fetchOptions: { credentials: 'include' },
    }) as AuthClientWithConvex

    // Token cache to avoid redundant fetches
    let lastTokenValidation = Date.now()
    let lastNullTokenCheck = 0
    const TOKEN_CACHE_MS = 10000
    const NULL_TOKEN_CACHE_MS = 5000 // Cache "not logged in" state to avoid duplicate 401s
    const skipRoutes = (config.public.convex?.skipAuthRoutes as string[]) || []
    const router = useRouter()

    // Cancellation controller for auth operations (kept for potential future use)
    // let currentAuthOperation: AbortController | null = null

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

      // Check if operation was cancelled before starting
      if (signal?.aborted) {
        logger.auth({
          phase: 'client-fetchToken:abort',
          outcome: 'skip',
          details: { traceId: convexAuthTraceId.value, reason: 'signal-aborted-before-start', path: routePath },
        })
        return null
      }

      // Layer 3: Page-level skip via definePageMeta({ skipConvexAuth: true })
      if (route.meta?.skipConvexAuth === true) {
        logger.auth({
          phase: 'client-fetchToken:skip',
          outcome: 'skip',
          details: { traceId: convexAuthTraceId.value, reason: 'page-meta-skip', path: routePath },
        })
        resolveInitialAuth()
        return null
      }

      // Layer 2: Config-based route skip (skipAuthRoutes in nuxt.config)
      if (matchesSkipRoute(route.path, skipRoutes)) {
        logger.auth({
          phase: 'client-fetchToken:skip',
          outcome: 'skip',
          details: { traceId: convexAuthTraceId.value, reason: 'skip-auth-route', path: routePath },
        })
        resolveInitialAuth()
        return null
      }

      // Use SSR-hydrated token if available
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

      // Use cached token if recently validated
      const timeSinceValidation = Date.now() - lastTokenValidation
      if (convexToken.value && forceRefreshToken && timeSinceValidation < TOKEN_CACHE_MS) {
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

      // Layer 1: SSR detection - trust hydration in SSR mode
      // If server rendered and no token/user, server would have hydrated if user was logged in
      // Skip this check if forceRefreshToken is true (session changed client-side)
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

      // Negative cache: if we recently confirmed no session, don't re-check
      // This prevents duplicate 401 requests during Convex client initialization
      const timeSinceNullCheck = Date.now() - lastNullTokenCheck
      if (!convexToken.value && timeSinceNullCheck < NULL_TOKEN_CACHE_MS) {
        logger.auth({
          phase: 'client-fetchToken:cache',
          outcome: 'miss',
          details: {
            traceId: convexAuthTraceId.value,
            source: 'negative-cache',
            ageMs: timeSinceNullCheck,
            path: routePath,
          },
        })
        resolveInitialAuth()
        return null
      }

      // CSR mode: must fetch token (unavoidable for HttpOnly cookie auth)
      try {
        logger.auth({
          phase: 'client-fetchToken:request',
          outcome: 'success',
          details: { traceId: convexAuthTraceId.value, endpoint: `${authRoute}/convex/token`, path: routePath },
        })
        const response = await authClient!.convex.token()

        // Check if operation was cancelled after async operation
        if (signal?.aborted) {
          logger.auth({
            phase: 'client-fetchToken:abort',
            outcome: 'skip',
            details: { traceId: convexAuthTraceId.value, reason: 'signal-aborted-after-request', path: routePath },
          })
          return null
        }

        if (response.error || !response.data?.token) {
          convexToken.value = null
          convexUser.value = null
          // Set auth error if there was an explicit error response
          if (response.error) {
            const errorMsg = typeof response.error === 'object' && response.error !== null && 'message' in response.error
              ? String((response.error as { message: unknown }).message)
              : 'Authentication failed'
            convexAuthError.value = errorMsg
          }
          lastNullTokenCheck = Date.now() // Cache the "no session" result
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
        convexAuthError.value = null // Clear any previous error on success
        lastTokenValidation = Date.now()

        // In CSR mode, extract user from JWT since server didn't hydrate it
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
        // Check if operation was cancelled
        if (signal?.aborted) {
          logger.auth({
            phase: 'client-fetchToken:abort',
            outcome: 'skip',
            details: { traceId: convexAuthTraceId.value, reason: 'signal-aborted-after-error', path: routePath },
          })
          return null
        }

        convexToken.value = null
        convexUser.value = null
        // Set auth error for caught exceptions
        convexAuthError.value = e instanceof Error ? e.message : 'Authentication request failed'
        lastNullTokenCheck = Date.now() // Cache the failed result
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

    // Watch for auth refresh signals (triggered by useConvexAuth.refreshAuth())
    watch(refreshSignal, () => {
      logger.auth({
        phase: 'client-refresh',
        outcome: 'success',
        details: {
          traceId: convexAuthTraceId.value,
          refreshSignal: refreshSignal.value,
        },
      })
      // Reset cache timestamps to force fresh fetch
      lastTokenValidation = 0
      lastNullTokenCheck = 0

      // Re-call setAuth to trigger fresh authentication
      client.setAuth(fetchToken, (_isAuthenticated) => {
        // Auth refresh complete
      })
    })

    // NOTE: We intentionally do NOT call authClient.useSession() here.
    // useSession() triggers a separate /get-session fetch which is redundant
    // since we already fetch /convex/token and decode user info from the JWT.
    //
    // Login/logout detection:
    // - LOGIN: User refreshes page or navigates after login → token is fetched naturally
    // - LOGOUT: Use the signOut() helper from useConvexAuth() which clears both
    //           Better Auth session AND Convex state atomically
    //
    // If you need reactive session watching, use authClient.useSession() in your component,
    // but be aware it adds an extra API call (~2 Convex queries).
  }
  else {
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
    import('./devtools/bridge-setup').then(({ setupDevToolsBridge }) => {
      setupDevToolsBridge(client, convexToken, convexUser, convexAuthWaterfall)
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
