/**
 * Server-side plugin for SSR authentication
 *
 * This plugin runs during SSR to:
 * 1. Read the session cookie from the request
 * 2. Exchange the session cookie for a JWT token via Better Auth API
 *    (with optional caching to reduce TTFB)
 * 3. Store the token and user data in useState for client hydration
 *
 * This ensures authenticated state is available on first render with zero flash.
 */

import { defineNuxtPlugin, useState, useRuntimeConfig, useRequestEvent } from '#app'

import type { AuthWaterfall } from './devtools/types'
import { resolveServerAuthSnapshot } from './server/utils/auth-snapshot'
import { fetchWithTimeout } from './server/utils/http'
import {
  buildAuthProxyUnreachableMessage,
  buildAuthProxyUpstreamStatusMessage,
  buildMissingSiteUrlMessage,
} from './utils/auth-errors'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import type { ConvexUser } from './utils/types'

const AUTH_HEALTHCHECK_CACHE_KEY = '__BCN_AUTH_HEALTHCHECK_DONE__'

async function runAuthHealthcheckOnce(siteUrl: string): Promise<void> {
  if (!import.meta.dev) return

  const globalState = globalThis as typeof globalThis & {
    [AUTH_HEALTHCHECK_CACHE_KEY]?: Set<string>
  }
  if (!globalState[AUTH_HEALTHCHECK_CACHE_KEY]) {
    globalState[AUTH_HEALTHCHECK_CACHE_KEY] = new Set<string>()
  }
  const checked = globalState[AUTH_HEALTHCHECK_CACHE_KEY]
  if (checked.has(siteUrl)) return
  checked.add(siteUrl)

  try {
    const response = await fetchWithTimeout(`${siteUrl}/api/auth/get-session`, {
      method: 'GET',
      timeoutMs: 5_000,
    })
    if ([200, 401, 403].includes(response.status)) {
      return
    }
    if (response.status === 404) {
      console.warn(
        buildAuthProxyUpstreamStatusMessage(siteUrl, '/get-session', 404),
        'Did you register Better Auth routes in `convex/http.ts` and deploy them?',
      )
      return
    }
    console.warn(buildAuthProxyUpstreamStatusMessage(siteUrl, '/get-session', response.status))
  } catch (error) {
    console.warn(buildAuthProxyUnreachableMessage(siteUrl, error))
  }
}

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()
  const publicConvex = config.public.convex as Record<string, unknown> | undefined
  const logLevel = getLogLevel(publicConvex)
  const logger = createLogger(logLevel)
  const endInit = logger.time('plugin:init (server)')
  const debugConfig = publicConvex?.debug as
    | {
        authFlow?: boolean
        serverAuthFlow?: boolean
      }
    | undefined
  const enableServerAuthTrace =
    logLevel === 'debug' && (debugConfig?.authFlow === true || debugConfig?.serverAuthFlow === true)
  const rawAuthLog = logger.auth.bind(logger)
  logger.auth = (event) => {
    rawAuthLog(event)
    if (enableServerAuthTrace) {
      console.log('[BCN_AUTH][server]', {
        phase: event.phase,
        outcome: event.outcome,
        ...event.details,
        error: event.error ? event.error.message : null,
      })
    }
  }

  // Check if auth is enabled
  const authConfig = convexConfig.auth
  const isAuthEnabled = authConfig.enabled
  if (!isAuthEnabled) {
    // Auth not enabled - not an error, just skip auth setup
    endInit()
    logger.debug('Auth not enabled, skipping server-side auth')
    return
  }

  // Get the H3 event for accessing cookies
  const event = useRequestEvent()
  if (!event) {
    logger.auth({ phase: 'init', outcome: 'error', error: new Error('No request event available') })
    return
  }
  const requestPath = event.path || event.node.req.url || '(unknown)'
  const requestMethod = event.method || 'GET'
  const requestId = crypto.randomUUID()

  const siteUrl = convexConfig.siteUrl

  if (!siteUrl) {
    const message = buildMissingSiteUrlMessage(convexConfig.url)
    const convexAuthError = useState<string | null>('convex:authError', () => null)
    convexAuthError.value = message
    endInit()
    logger.auth({ phase: 'init', outcome: 'error', error: new Error(message) })
    return
  }

  void runAuthHealthcheckOnce(siteUrl)

  // Helper to log auth events
  const logAuth = (
    phase: string,
    outcome: 'success' | 'error' | 'skip' | 'miss',
    details?: Record<string, unknown>,
    error?: Error,
  ) => {
    logger.auth({
      phase,
      outcome,
      details: {
        requestId,
        method: requestMethod,
        path: requestPath,
        ...details,
      },
      error,
    })
  }

  // Initialize useState for hydration (must be done even if unauthenticated)
  const convexToken = useState<string | null>('convex:token', () => null)
  const convexUser = useState<ConvexUser | null>('convex:user', () => null)
  const convexAuthError = useState<string | null>('convex:authError', () => null)
  const convexAuthWaterfall = useState<AuthWaterfall | null>('convex:authWaterfall', () => null)

  const cookieHeader = event.headers.get('cookie')

  const snapshot = await resolveServerAuthSnapshot({
    siteUrl,
    cookieHeader,
    authCache: convexConfig.authCache,
    requestId,
    trackWaterfall: import.meta.dev,
    throwOnMisconfig: import.meta.dev,
  })

  convexToken.value = snapshot.token
  convexUser.value = snapshot.user
  convexAuthError.value = snapshot.authError
  convexAuthWaterfall.value = snapshot.waterfall

  endInit()
  for (const event of snapshot.logEvents) {
    logAuth(event.phase, event.outcome, event.details, event.error)
  }

  if (snapshot.devError) {
    throw snapshot.devError
  }
})
