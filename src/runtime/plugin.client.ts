import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import { ConvexClient } from 'convex/browser'

/**
 * Client-side Convex plugin with SSR token hydration.
 * Manually wires up setAuth() for zero-flash auth on first render.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, useRouter } from '#app'

import { createConvexAuthEngine, type AuthClientWithConvex } from './auth/client-engine'
import type { AuthWaterfall } from './devtools/types'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import type { ConvexUser } from './utils/types'

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
  const convexUser = useState<ConvexUser | null>('convex:user')
  const convexAuthWaterfall = useState<AuthWaterfall | null>('convex:authWaterfall')
  const convexAuthError = useState<string | null>('convex:authError')

  // Create Convex WebSocket client
  const client = new ConvexClient(convexUrl)
  let authClient: AuthClientWithConvex | null = null

  // Pending state for auth operations (exposed via useConvexAuth)
  // Start as true - will be set to false after first auth check completes
  const convexPending = useState('convex:pending', () => true)

  logger.auth({
    phase: 'client-init',
    outcome: 'success',
    details: {
      traceId: convexAuthTraceId.value,
      serverRendered: Boolean(nuxtApp.payload?.serverRendered),
      authEnabled: Boolean(isAuthEnabled),
    },
  })

  if (isAuthEnabled && resolvedSiteUrl) {
    const authRoute = convexConfig.authRoute
    const authBaseURL =
      typeof window !== 'undefined' ? `${window.location.origin}${authRoute}` : authRoute

    authClient = createAuthClient({
      baseURL: authBaseURL,
      plugins: [convexClient()],
      fetchOptions: { credentials: 'include' },
    }) as AuthClientWithConvex

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

  const router = useRouter()
  const authEngine = createConvexAuthEngine({
    nuxtApp,
    authClient,
    state: {
      token: convexToken,
      user: convexUser,
      pending: convexPending,
      authError: convexAuthError,
    },
    logger,
    traceId: convexAuthTraceId,
    convexUrl,
    isAuthEnabled,
    authRoute: convexConfig.authRoute,
    skipRoutes: convexConfig.skipAuthRoutes,
    getRoute: () => router.currentRoute.value,
    wasServerRendered: () => Boolean(nuxtApp.payload?.serverRendered),
  })
  authEngine.attachConvexClient(client)

  // Provide clients globally
  nuxtApp.provide('convex', client)
  if (authClient) {
    nuxtApp.provide('auth', authClient)
  }
  nuxtApp.provide('convexAuthEngine', authEngine)

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
