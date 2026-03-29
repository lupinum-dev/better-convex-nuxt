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

import type { AuthWaterfall } from './utils/auth-debug'
import { resolveRequestAuth } from './server/utils/auth-resolver'
import { fetchWithTimeout } from './server/utils/http'
import {
  SERVER_FETCH_TIMEOUT_MS,
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_AUTH_WATERFALL,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from './utils/constants'
import {
  buildClientAuthDecodeFailureMessage,
  buildAuthProxyUnreachableMessage,
  buildAuthProxyUpstreamStatusMessage,
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
      timeoutMs: SERVER_FETCH_TIMEOUT_MS,
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

  if (siteUrl) {
    void runAuthHealthcheckOnce(siteUrl)
  }

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
  const convexToken = useState<string | null>(STATE_KEY_TOKEN, () => null)
  const convexUser = useState<ConvexUser | null>(STATE_KEY_USER, () => null)
  const convexAuthError = useState<string | null>(STATE_KEY_AUTH_ERROR, () => null)
  // authWaterfall is dev-only — skip allocation in production to avoid serializing dead state
  const convexAuthWaterfall = import.meta.dev
    ? useState<AuthWaterfall | null>(STATE_KEY_AUTH_WATERFALL, () => null)
    : { value: null as AuthWaterfall | null }

  const resolvedAuth = await resolveRequestAuth(event, convexConfig)
  const hydratedAuthDecodeFailed = Boolean(resolvedAuth.token && resolvedAuth.jwtDecodeFailed)
  logAuth('server-init', 'success', {
    hasCookieHeader: Boolean(event.headers.get('cookie')),
    hasSessionToken: resolvedAuth.hasSessionCookie,
    cacheEnabled: Boolean(convexConfig.auth.cache.enabled),
  })

  if (hydratedAuthDecodeFailed) {
    convexToken.value = null
    convexUser.value = null
    convexAuthError.value = buildClientAuthDecodeFailureMessage()
  } else {
    convexToken.value = resolvedAuth.token
    convexUser.value = resolvedAuth.user
    convexAuthError.value = resolvedAuth.error
  }

  if (import.meta.dev && hydratedAuthDecodeFailed) {
    console.warn(
      '[better-convex-nuxt] JWT decode failed during SSR hydration. Auth state was cleared to unauthenticated because the token is invalid for client use. Configure Better Auth to include user claims in the JWT.',
    )
  }

  if (import.meta.dev) {
    convexAuthWaterfall.value = {
      requestId,
      timestamp: resolvedAuth.trace.startedAt,
      phases: resolvedAuth.trace.phases,
      totalDuration: resolvedAuth.trace.totalDuration,
      outcome: resolvedAuth.trace.outcome,
      cacheHit: resolvedAuth.trace.cacheHit,
      error: resolvedAuth.trace.error,
    }
  }

  if (!resolvedAuth.hasSessionCookie) {
    endInit()
    logAuth('session-check', 'miss')
    return
  }

  if (resolvedAuth.source === 'cache' && resolvedAuth.token && !hydratedAuthDecodeFailed) {
    endInit()
    logAuth('cache', 'success', { source: 'cache' })
    return
  }

  if (resolvedAuth.token && !hydratedAuthDecodeFailed) {
    endInit()
    logAuth('exchange', 'success', { user: resolvedAuth.user?.email })
    return
  }

  if (hydratedAuthDecodeFailed) {
    endInit()
    logAuth(
      resolvedAuth.source === 'cache' ? 'cache' : 'exchange',
      'error',
      { source: resolvedAuth.source, decodeFailure: true },
      new Error(convexAuthError.value ?? buildClientAuthDecodeFailureMessage()),
    )
    return
  }

  endInit()
  logAuth(
    'exchange',
    resolvedAuth.error ? 'error' : 'miss',
    resolvedAuth.tokenExchangeStatus ? { status: resolvedAuth.tokenExchangeStatus } : undefined,
    resolvedAuth.tokenExchangeError ?? undefined,
  )

  if (import.meta.dev && resolvedAuth.isMisconfigError) {
    throw new Error(resolvedAuth.error ?? 'Convex auth token exchange failed')
  }
})
