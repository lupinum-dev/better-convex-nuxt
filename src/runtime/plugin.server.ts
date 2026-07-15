/**
 * Auth-enabled-only server plugin. Registered by the module only
 * when auth is enabled. It runs during SSR to:
 * 1. Read the session cookie from the request
 * 2. Exchange the session cookie for a JWT token via Better Auth API
 *    (with optional caching to reduce TTFB)
 * 3. Store the token and user data in useState for client hydration
 *
 * This ensures authenticated state is available on first render with zero flash.
 */

import { defineNuxtPlugin, useState, useRuntimeConfig, useRequestEvent } from '#app'

import { ANONYMOUS_IDENTITY, toAuthenticatedIdentity } from './auth/auth-identity'
import type { AuthWaterfall } from './devtools/types'
import { resolveServerAuthSnapshot } from './server/utils/auth-snapshot'
import { applyConvexAuthSsrHeaders } from './server/utils/ssr-auth-headers'
import { buildMissingSiteUrlMessage } from './utils/auth-errors'
import { useConvexIdentityState } from './utils/auth-identity-state'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import { filterBetterAuthCookies } from './utils/shared-helpers'

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()
  const authConfig = convexConfig.auth
  const publicConvex = config.public.convex as Record<string, unknown> | undefined
  const logLevel = getLogLevel(publicConvex)
  const logger = createLogger(logLevel)
  const endInit = logger.time('plugin:init (server)')

  // Defensive: the module never registers this plugin for a Convex-only build.
  if (authConfig === false) {
    endInit()
    logger.debug('Auth not enabled, skipping server-side auth')
    return
  }

  const event = useRequestEvent()
  if (!event) {
    logger.auth({ phase: 'init', outcome: 'error', error: new Error('No request event available') })
    return
  }
  const requestMethod = event.method || 'GET'
  const requestId = crypto.randomUUID()
  const convexIdentity = useConvexIdentityState()
  const cookieHeader = event.headers.get('cookie')
  const hasSupportedBetterAuthCookie = filterBetterAuthCookies(cookieHeader) !== null

  const siteUrl = convexConfig.siteUrl
  if (!siteUrl) {
    applyConvexAuthSsrHeaders(event, {
      hasBetterAuthCookie: hasSupportedBetterAuthCookie,
      serializesToken: false,
    })
    const message = buildMissingSiteUrlMessage(convexConfig.url)
    const convexAuthError = useState<string | null>('convex:authError', () => null)
    convexAuthError.value = message
    endInit()
    logger.auth({ phase: 'init', outcome: 'error', error: new Error(message) })
    return
  }

  const logAuth = (
    phase: string,
    outcome: 'success' | 'error' | 'skip' | 'miss',
    details?: Record<string, unknown>,
    error?: Error,
  ) => {
    logger.auth({
      phase,
      outcome,
      details: { requestId, method: requestMethod, ...details },
      error,
    })
  }

  // Initialize useState for hydration (must be done even if unauthenticated).
  const convexAuthError = useState<string | null>('convex:authError', () => null)
  const convexAuthWaterfall = useState<AuthWaterfall | null>('convex:authWaterfall', () => null)

  const snapshot = await resolveServerAuthSnapshot({
    siteUrl,
    cookieHeader,
    requestId,
    trackWaterfall: import.meta.dev,
    throwOnMisconfig: import.meta.dev,
    // Detailed token-exchange failures are dev-only; production hydrates a
    // generic message.
    revealAuthErrorDetails: import.meta.dev,
  })

  convexIdentity.value =
    snapshot.token && snapshot.user
      ? toAuthenticatedIdentity(snapshot.token, snapshot.user)
      : ANONYMOUS_IDENTITY
  convexAuthError.value = snapshot.authError
  convexAuthWaterfall.value = snapshot.waterfall

  // This is an auth-enabled SSR response, so it always varies by cookie. A
  // recognized Better Auth cookie OR a serialized per-user JWT also forbids
  // shared/CDN caching. Existing `Vary` values are preserved.
  applyConvexAuthSsrHeaders(event, {
    hasBetterAuthCookie: hasSupportedBetterAuthCookie,
    serializesToken: snapshot.token !== null,
  })

  endInit()
  for (const logEvent of snapshot.logEvents) {
    logAuth(logEvent.phase, logEvent.outcome, logEvent.details, logEvent.error)
  }

  if (snapshot.devError) {
    throw snapshot.devError
  }
})
