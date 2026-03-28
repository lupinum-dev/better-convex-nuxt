/**
 * Client-side Convex plugin with SSR token hydration.
 * Orchestrates auth setup for zero-flash auth on first render.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, useRouter } from '#app'

import { initAuthClient } from './client/auth-client'
import { initConvexClient } from './client/convex-client'
import { setupDevtoolsBridgeIfDev } from './client/devtools'
import { initRuntimeAuthHooks, initRuntimeConnectionHooks } from './client/runtime-hooks'
import { initHydrationState } from './client/auth-hydration'
import { buildMissingSiteUrlMessage } from './utils/auth-errors'
import { STATE_KEY_AUTH_TRACE_ID, STATE_KEY_DEVTOOLS_INSTANCE_ID } from './utils/constants'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'

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

  if (isAuthEnabled && !resolvedSiteUrl) {
    hydration.convexAuthError.value = buildMissingSiteUrlMessage(convexUrl)
    hydration.convexPending.value = false
    nuxtApp.hook('better-convex:auth:refresh', async () => {
      throw new Error(hydration.convexAuthError.value ?? buildMissingSiteUrlMessage(convexUrl))
    })
    logger.auth({ phase: 'client-init', outcome: 'error', error: new Error(hydration.convexAuthError.value ?? ''), details: { traceId } })
  }

  const client = initConvexClient(convexUrl)
  let authClient = null

  if (isAuthEnabled && resolvedSiteUrl) {
    const authRoute = authConfig.route
    const authBaseURL = typeof window !== 'undefined' ? `${window.location.origin}${authRoute}` : authRoute
    const router = useRouter()

    authClient = initAuthClient(client, {
      baseURL: authBaseURL,
      authRoute,
      skipRoutes: authConfig.skipAuthRoutes,
      convexToken: hydration.convexToken,
      convexUser: hydration.convexUser,
      convexAuthError: hydration.convexAuthError,
      resolveInitialAuth: hydration.resolveInitialAuth,
      logger,
      nuxtApp,
      router,
      traceId,
    })
  } else {
    hydration.convexPending.value = false
  }

  nuxtApp.provide('convex', client)
  initRuntimeConnectionHooks(nuxtApp, client, logger)
  initRuntimeAuthHooks(nuxtApp, hydration.convexToken, hydration.convexUser)
  if (authClient) {
    nuxtApp.provide('auth', authClient)
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
