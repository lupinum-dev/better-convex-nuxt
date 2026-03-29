/**
 * Client-side Convex plugin with SSR token hydration.
 * Orchestrates auth setup for zero-flash auth on first render.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, useRouter } from '#app'

import { initAuthClient } from './client/auth-client'
import { getOrCreateSharedAuthEngine } from './client/auth-engine'
import { initConvexClient } from './client/convex-client'
import { setupDevtoolsBridgeIfDev } from './client/devtools'
import { initRuntimeConnectionHooks } from './client/runtime-hooks'
import { initHydrationState } from './client/auth-hydration'
import { buildMissingSiteUrlMessage } from './utils/auth-errors'
import { STATE_KEY_AUTH_TRACE_ID, STATE_KEY_DEVTOOLS_INSTANCE_ID } from './utils/constants'
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

  const debugConfig = publicConvex?.debug as { authFlow?: boolean; clientAuthFlow?: boolean } | undefined
  const enableClientAuthTrace =
    logLevel === 'debug' && (debugConfig?.authFlow === true || debugConfig?.clientAuthFlow === true)
  if (enableClientAuthTrace) {
    const rawAuthLog = logger.auth.bind(logger)
    logger.auth = (event) => {
      rawAuthLog(event)
      console.log('[BCN_AUTH][client]', {
        phase: event.phase,
        outcome: event.outcome,
        ...event.details,
        error: event.error ? event.error.message : null,
      })
    }
  }

  // HMR-safe initialization
  if (nuxtApp.$convex) {
    logger.debug('plugin:init (client) skipped; already initialized')
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

  const hydration = initHydrationState()
  const wasAuthenticated = useState<boolean>(
    'better-convex:was-authenticated',
    () => Boolean(hydration.convexToken.value && hydration.convexUser.value),
  )
  const traceId = import.meta.dev
    ? (useState<string>(STATE_KEY_AUTH_TRACE_ID).value ?? 'unknown')
    : 'prod'

  logger.auth({
    phase: 'client-init',
    outcome: 'success',
    details: {
      traceId,
      serverRendered: Boolean(nuxtApp.payload?.serverRendered),
      authEnabled: Boolean(isAuthEnabled),
    },
  })

  const client = initConvexClient(convexUrl)
  const authEngine = getOrCreateSharedAuthEngine({
    nuxtApp,
    token: hydration.convexToken,
    user: hydration.convexUser as typeof hydration.convexUser & { value: ConvexUser | null },
    pending: hydration.convexPending,
    rawAuthError: hydration.convexAuthError,
    wasAuthenticated,
    onSetAuthState: (isAuthenticated) => {
      logger.auth({
        phase: 'client-setAuth',
        outcome: 'success',
        details: {
          traceId,
          state: isAuthenticated ? 'authenticated' : 'unauthenticated',
          hasToken: Boolean(hydration.convexToken.value),
          hasUser: Boolean(hydration.convexUser.value),
        },
      })
    },
    resolveInitialAuth: hydration.resolveInitialAuth,
  })

  if (isAuthEnabled && resolvedSiteUrl) {
    const authRoute = authConfig.route
    const authBaseURL = typeof window !== 'undefined' ? `${window.location.origin}${authRoute}` : authRoute
    const router = useRouter()

    authEngine.configureTransport(initAuthClient(client, {
      baseURL: authBaseURL,
      authRoute,
      skipRoutes: authConfig.skipAuthRoutes,
      convexToken: hydration.convexToken,
      convexUser: hydration.convexUser,
      logger,
      nuxtApp,
      router,
      traceId,
    }))
  } else if (isAuthEnabled) {
    const missingSiteUrlMessage = buildMissingSiteUrlMessage(convexUrl)
    authEngine.initialize({
      error: missingSiteUrlMessage,
      resolveInitialAuth: true,
    })
    logger.auth({
      phase: 'client-init',
      outcome: 'error',
      error: new Error(missingSiteUrlMessage),
      details: { traceId },
    })
  } else {
    authEngine.initialize({ resolveInitialAuth: true })
  }

  nuxtApp.provide('convex', client)
  initRuntimeConnectionHooks(nuxtApp, client, logger)
  if (authEngine.client) {
    nuxtApp.provide('auth', authEngine.client)
  }

  if (import.meta.dev) {
    const devtoolsInstanceId = useState<string>(STATE_KEY_DEVTOOLS_INSTANCE_ID).value ?? 'unknown'
    setupDevtoolsBridgeIfDev(
      client,
      hydration.convexToken,
      hydration.convexUser,
      hydration.convexAuthWaterfall,
      devtoolsInstanceId,
      nuxtApp,
    )
  }

  endInit()

  if (hydration.convexToken.value) {
    logger.auth({ phase: 'hydrate', outcome: 'success', details: { source: 'ssr' } })
  } else if (isAuthEnabled) {
    logger.auth({ phase: 'hydrate', outcome: 'miss', details: { traceId, source: 'client-init' } })
  } else {
    logger.debug('Client initialized (auth disabled)')
  }
})
