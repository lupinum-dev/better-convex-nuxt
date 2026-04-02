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

import type { Ref } from 'vue'

import { defineNuxtPlugin, useState, useRuntimeConfig, useRequestEvent } from '#app'

import { createSharedAuthEngine } from './client/auth-engine'
import { projectResolvedAuthForHydration } from './server/utils/auth-hydration'
import { resolveRequestAuth } from './server/utils/auth-resolver'
import type { AuthWaterfall } from './utils/auth-debug'
import { buildAuthTokenDecodeFailureMessage } from './utils/auth-errors'
import {
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_AUTH_WATERFALL,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from './utils/constants'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import type { ConvexUser } from './utils/types'
export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()
  const publicConvex = config.public.convex as Record<string, unknown> | undefined
  const logLevel = getLogLevel(publicConvex)
  const logger = createLogger(logLevel)
  const endInit = logger.time('plugin:init (server)')
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
  const convexPending = useState<boolean>(STATE_KEY_PENDING, () => true)
  const wasAuthenticated = useState<boolean>('trellis:was-authenticated', () => false)
  // authWaterfall is dev-only — skip allocation in production to avoid serializing dead state
  const convexAuthWaterfall = import.meta.dev
    ? useState<AuthWaterfall | null>(STATE_KEY_AUTH_WATERFALL, () => null)
    : { value: null as AuthWaterfall | null }
  const authEngine = createSharedAuthEngine({
    nuxtApp,
    token: convexToken,
    user: convexUser as Ref<ConvexUser | null>,
    pending: convexPending,
    rawAuthError: convexAuthError,
    wasAuthenticated,
  })

  const resolvedAuth = await resolveRequestAuth(event, convexConfig)
  const hydratedAuth = projectResolvedAuthForHydration(resolvedAuth)
  logAuth('server-init', 'success', {
    hasCookieHeader: Boolean(event.headers.get('cookie')),
    hasSessionToken: resolvedAuth.hasSessionCookie,
    cacheEnabled: Boolean(convexConfig.auth.cache.enabled),
  })

  convexToken.value = hydratedAuth.token
  convexUser.value = hydratedAuth.user
  convexAuthError.value = hydratedAuth.error
  wasAuthenticated.value = Boolean(hydratedAuth.token && hydratedAuth.user)
  authEngine.initialize({
    error: hydratedAuth.error,
    resolveInitialAuth: true,
  })

  if (import.meta.dev && hydratedAuth.decodeFailed) {
    console.warn(
      '[trellis] JWT decode failed during SSR hydration. Auth state was cleared to unauthenticated because the token is invalid for client use. Configure Better Auth to include user claims in the JWT.',
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

  if (resolvedAuth.source === 'cache' && hydratedAuth.token) {
    endInit()
    logAuth('cache', 'success', { source: 'cache' })
    return
  }

  if (hydratedAuth.token) {
    endInit()
    logAuth('exchange', 'success', { user: resolvedAuth.user?.email })
    return
  }

  if (hydratedAuth.decodeFailed) {
    endInit()
    logAuth(
      resolvedAuth.source === 'cache' ? 'cache' : 'exchange',
      'error',
      { source: resolvedAuth.source, decodeFailure: true },
      new Error(convexAuthError.value ?? buildAuthTokenDecodeFailureMessage()),
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
