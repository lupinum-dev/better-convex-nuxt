/**
 * Auth-enabled-only server plugin (vNext §5.1). Registered by the module ONLY
 * when auth is enabled. It runs during SSR to:
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
import { applyConvexAuthSsrHeaders } from './server/utils/ssr-auth-headers'
import { buildMissingSiteUrlMessage } from './utils/auth-errors'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import { getBetterAuthSessionToken } from './utils/shared-helpers'
import type { ConvexUser } from './utils/types'

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

  const logAuth = (
    phase: string,
    outcome: 'success' | 'error' | 'skip' | 'miss',
    details?: Record<string, unknown>,
    error?: Error,
  ) => {
    logger.auth({
      phase,
      outcome,
      details: { requestId, method: requestMethod, path: requestPath, ...details },
      error,
    })
  }

  // Initialize useState for hydration (must be done even if unauthenticated).
  const convexToken = useState<string | null>('convex:token', () => null)
  const convexUser = useState<ConvexUser | null>('convex:user', () => null)
  const convexAuthError = useState<string | null>('convex:authError', () => null)
  const convexAuthWaterfall = useState<AuthWaterfall | null>('convex:authWaterfall', () => null)

  const cookieHeader = event.headers.get('cookie')

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

  convexToken.value = snapshot.token
  convexUser.value = snapshot.user
  convexAuthError.value = snapshot.authError
  convexAuthWaterfall.value = snapshot.waterfall

  // This is an auth-enabled SSR response, so it always varies by cookie. When a
  // recognized Better Auth cookie is present AND a per-user JWT was serialized
  // into the SSR payload, also forbid shared/CDN caching so it never reaches a
  // different user (vNext §9). Existing `Vary` values are preserved.
  applyConvexAuthSsrHeaders(event, {
    authEnabled: true,
    hasBetterAuthCookie: getBetterAuthSessionToken(cookieHeader) !== null,
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
