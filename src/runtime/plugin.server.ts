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
import { createModuleLogger, getLoggingOptions, createTimer } from './utils/logger'
import type { PluginInitEvent, AuthChangeEvent } from './utils/logger'
import { getCachedAuthToken, setCachedAuthToken } from './server/utils/auth-cache'
import type { ConvexUser } from './utils/types'
import type { AuthWaterfall, AuthWaterfallPhase } from './devtools/types'
import { getCookie } from './utils/shared-helpers'

/** Session cookie name used by Better Auth */
const SESSION_COOKIE_NAME = 'better-auth.session_token'

/**
 * Helper to build a waterfall phase entry
 */
function buildPhase(
  name: string,
  startTime: number,
  waterfallStart: number,
  result: AuthWaterfallPhase['result'],
  details?: string,
): AuthWaterfallPhase {
  const end = Date.now()
  return {
    name,
    start: startTime - waterfallStart,
    end: end - waterfallStart,
    duration: end - startTime,
    result,
    details,
  }
}

/**
 * Decode user info from JWT payload
 */
function decodeUserFromJwt(token: string): ConvexUser | null {
  try {
    const payloadBase64 = token.split('.')[1]
    if (payloadBase64) {
      // Use Buffer instead of atob for cross-environment compatibility (Node, Edge, etc.)
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'))
      if (payload.sub || payload.userId || payload.email) {
        return {
          id: payload.sub || payload.userId || '',
          name: payload.name || '',
          email: payload.email || '',
          emailVerified: payload.emailVerified,
          image: payload.image,
        }
      }
    }
  } catch {
    // Ignore decode errors
  }
  return null
}

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()
  const loggingOptions = getLoggingOptions(config.public.convex ?? {})
  const logger = createModuleLogger(loggingOptions)
  const initTimer = createTimer()

  // Get the H3 event for accessing cookies
  const event = useRequestEvent()
  if (!event) {
    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: '', siteUrl: '', authEnabled: false },
      duration_ms: initTimer(),
      outcome: 'error',
      error: { type: 'SSRError', message: 'No request event available' },
    } satisfies PluginInitEvent)
    return
  }

  const convexUrl = config.public.convex?.url as string | undefined
  const siteUrl = config.public.convex?.siteUrl as string | undefined

  if (!siteUrl) {
    // No auth configured - not an error, just no auth
    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: convexUrl || '', siteUrl: '', authEnabled: false },
      duration_ms: initTimer(),
      outcome: 'success',
    } satisfies PluginInitEvent)
    return
  }

  // Initialize useState for hydration (must be done even if unauthenticated)
  const convexToken = useState<string | null>('convex:token', () => null)
  const convexUser = useState<ConvexUser | null>('convex:user', () => null)
  const convexAuthWaterfall = useState<AuthWaterfall | null>('convex:authWaterfall', () => null)

  // Waterfall tracking
  const waterfallStart = Date.now()
  const phases: AuthWaterfallPhase[] = []
  let cacheHit = false

  // Phase 1: Session Check
  const sessionCheckStart = Date.now()
  const cookieHeader = event.headers.get('cookie')
  const sessionToken = getCookie(cookieHeader, SESSION_COOKIE_NAME)

  // Check if we have a session cookie
  if (!cookieHeader || !sessionToken) {
    phases.push(buildPhase('session-check', sessionCheckStart, waterfallStart, 'miss', 'No session cookie'))

    // Store waterfall even for unauthenticated requests
    convexAuthWaterfall.value = {
      requestId: crypto.randomUUID(),
      timestamp: waterfallStart,
      phases,
      totalDuration: Date.now() - waterfallStart,
      outcome: 'unauthenticated',
      cacheHit: false,
    }

    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: convexUrl || '', siteUrl, authEnabled: true },
      duration_ms: initTimer(),
      outcome: 'success',
    } satisfies PluginInitEvent)
    return
  }

  phases.push(buildPhase('session-check', sessionCheckStart, waterfallStart, 'success', 'Cookie found'))

  // Get auth cache config
  const authCacheConfig = (config.public.convex as { authCache?: { enabled: boolean; ttl: number } })
    ?.authCache

  try {
    let token: string | null = null

    // Phase 2: Cache Lookup (if enabled)
    if (authCacheConfig?.enabled && sessionToken) {
      const cacheStart = Date.now()
      token = await getCachedAuthToken(sessionToken)
      if (token) {
        // Cache hit - use cached token
        cacheHit = true
        phases.push(buildPhase('cache-lookup', cacheStart, waterfallStart, 'hit', 'Token from cache'))

        // Phase 3: JWT Decode (from cache)
        const decodeStart = Date.now()
        convexToken.value = token
        convexUser.value = decodeUserFromJwt(token)
        phases.push(buildPhase('jwt-decode', decodeStart, waterfallStart, convexUser.value ? 'success' : 'error'))

        // Store waterfall
        convexAuthWaterfall.value = {
          requestId: crypto.randomUUID(),
          timestamp: waterfallStart,
          phases,
          totalDuration: Date.now() - waterfallStart,
          outcome: 'authenticated',
          cacheHit: true,
        }

        logger.event({
          event: 'auth:change',
          env: 'server',
          from: 'unauthenticated',
          to: 'authenticated',
          trigger: 'init',
          user_id: convexUser.value?.id?.slice(0, 8),
        } satisfies AuthChangeEvent)

        logger.event({
          event: 'plugin:init',
          env: 'server',
          config: { url: convexUrl || '', siteUrl, authEnabled: true },
          duration_ms: initTimer(),
          outcome: 'success',
        } satisfies PluginInitEvent)
        return
      } else {
        phases.push(buildPhase('cache-lookup', cacheStart, waterfallStart, 'miss', 'Cache miss'))
      }
    } else if (authCacheConfig?.enabled === false) {
      // Cache explicitly disabled
      phases.push({
        name: 'cache-lookup',
        start: 0,
        end: 0,
        duration: 0,
        result: 'skipped',
        details: 'Cache disabled',
      })
    }

    // Phase 3: Token Exchange (cache miss or caching disabled)
    const exchangeStart = Date.now()
    const tokenResponse = await $fetch(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    }).catch(() => null) as { token?: string } | null

    if (tokenResponse?.token) {
      phases.push(buildPhase('token-exchange', exchangeStart, waterfallStart, 'success', `${siteUrl}/api/auth/convex/token`))
      token = tokenResponse.token
      convexToken.value = token

      // Phase 4: JWT Decode
      const decodeStart = Date.now()
      convexUser.value = decodeUserFromJwt(token)

      // If decode failed, fallback to session endpoint
      if (!convexUser.value) {
        const sessionResponse = await $fetch(
          `${siteUrl}/api/auth/get-session`,
          { headers: { Cookie: cookieHeader } },
        ).catch(() => null) as { user?: ConvexUser } | null
        if (sessionResponse?.user) {
          convexUser.value = sessionResponse.user
        }
        phases.push(buildPhase('jwt-decode', decodeStart, waterfallStart, 'success', 'Fallback to session endpoint'))
      } else {
        phases.push(buildPhase('jwt-decode', decodeStart, waterfallStart, 'success'))
      }

      // Phase 5: Cache Store (if caching is enabled)
      if (authCacheConfig?.enabled && sessionToken && token) {
        const storeStart = Date.now()
        const ttl = authCacheConfig.ttl ?? 900
        await setCachedAuthToken(sessionToken, token, ttl)
        phases.push(buildPhase('cache-store', storeStart, waterfallStart, 'success', `TTL: ${ttl}s`))
      }

      // Log successful auth
      logger.event({
        event: 'auth:change',
        env: 'server',
        from: 'unauthenticated',
        to: 'authenticated',
        trigger: 'init',
        user_id: convexUser.value?.id?.slice(0, 8),
      } satisfies AuthChangeEvent)
    } else {
      phases.push(buildPhase('token-exchange', exchangeStart, waterfallStart, 'error', 'No token returned'))
    }

    // Store waterfall
    convexAuthWaterfall.value = {
      requestId: crypto.randomUUID(),
      timestamp: waterfallStart,
      phases,
      totalDuration: Date.now() - waterfallStart,
      outcome: convexToken.value ? 'authenticated' : 'unauthenticated',
      cacheHit,
    }

    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: convexUrl || '', siteUrl, authEnabled: true },
      duration_ms: initTimer(),
      outcome: 'success',
    } satisfies PluginInitEvent)
  } catch (error) {
    // Token exchange failed - session may be invalid/expired
    convexToken.value = null
    convexUser.value = null

    // Store waterfall with error
    convexAuthWaterfall.value = {
      requestId: crypto.randomUUID(),
      timestamp: waterfallStart,
      phases,
      totalDuration: Date.now() - waterfallStart,
      outcome: 'error',
      cacheHit: false,
      error: error instanceof Error ? error.message : 'Token exchange failed',
    }

    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: convexUrl || '', siteUrl, authEnabled: true },
      duration_ms: initTimer(),
      outcome: 'error',
      error: {
        type: 'AuthError',
        message: error instanceof Error ? error.message : 'Token exchange failed',
        hint: 'Session may be expired or invalid',
      },
    } satisfies PluginInitEvent)
  }
})
