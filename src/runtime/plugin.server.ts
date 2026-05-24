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

import { createSharedAuthEngine } from './auth/client/auth-engine.js'
import { projectResolvedAuthForHydration } from './auth/server/auth-hydration.js'
import { resolveRequestAuth } from './auth/server/auth-resolver.js'
import type { AuthWaterfall } from './auth/shared/auth-debug.js'
import { buildAuthTokenDecodeFailureMessage } from './auth/shared/auth-errors.js'
import { getConvexRuntimeConfig } from './convex/shared/runtime-config.js'
import { createRuntimeObserver } from './observability/runtime-observer.js'
import {
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_AUTH_WATERFALL,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from './utils/constants.js'
import type { AuthSessionUser } from './utils/types.js'

function applyAuthenticatedSsrCacheHeaders(event: NonNullable<ReturnType<typeof useRequestEvent>>) {
  const response = (
    event as { node?: { res?: { setHeader?: (name: string, value: string) => void } } }
  ).node?.res
  if (!response?.setHeader) return

  response.setHeader('Cache-Control', 'private, no-store')
  response.setHeader('Vary', 'Cookie')
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()
  // Check if auth is enabled
  const authConfig = convexConfig.auth
  const isAuthEnabled = authConfig.enabled

  // Get the H3 event for accessing cookies
  const event = useRequestEvent()
  const requestPath = event?.path || event?.node.req.url || '(unknown)'
  const requestMethod = event?.method || 'GET'
  const requestId = crypto.randomUUID()
  const logger = createRuntimeObserver(
    config.public.convex,
    { transport: 'nuxt-server', requestId },
    { method: requestMethod, path: requestPath },
  )
  const endInit = logger.time('plugin:init (server)')

  if (!isAuthEnabled) {
    endInit()
    logger.debug('Auth not enabled, skipping server-side auth')
    logger.emitSummary({ status: 'skip' })
    return
  }

  if (!event) {
    logger.auth({ phase: 'init', outcome: 'error', error: new Error('No request event available') })
    logger.emitSummary({
      status: 'error',
      details: { message: 'No request event available' },
    })
    return
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
  const convexUser = useState<AuthSessionUser | null>(STATE_KEY_USER, () => null)
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
    user: convexUser,
    pending: convexPending,
    rawAuthError: convexAuthError,
    wasAuthenticated,
  })

  const resolvedAuth = await resolveRequestAuth(event, convexConfig)
  const hydratedAuth = projectResolvedAuthForHydration(resolvedAuth)

  if (resolvedAuth.hasSessionCookie) {
    applyAuthenticatedSsrCacheHeaders(event)
  }

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
    logger.emitSummary({ status: 'skip' })
    return
  }

  if (resolvedAuth.source === 'cache' && hydratedAuth.token) {
    endInit()
    logAuth('cache', 'success', { source: 'cache' })
    logger.emitSummary({ status: 'success' })
    return
  }

  if (hydratedAuth.token) {
    endInit()
    logAuth('exchange', 'success', { user: resolvedAuth.user?.email })
    logger.emitSummary({ status: 'success' })
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
    logger.emitSummary({
      status: 'error',
      details: { decodeFailure: true, source: resolvedAuth.source },
    })
    return
  }

  endInit()
  logAuth(
    'exchange',
    resolvedAuth.error ? 'error' : 'miss',
    resolvedAuth.tokenExchangeStatus ? { status: resolvedAuth.tokenExchangeStatus } : undefined,
    resolvedAuth.tokenExchangeError ?? undefined,
  )
  logger.emitSummary({
    status: resolvedAuth.error ? 'error' : 'skip',
    details: resolvedAuth.tokenExchangeStatus
      ? { status: resolvedAuth.tokenExchangeStatus }
      : undefined,
  })

  if (import.meta.dev && resolvedAuth.isMisconfigError) {
    throw new Error(resolvedAuth.error ?? 'Convex auth token exchange failed')
  }
})
