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
import { createLogger, getLogLevel } from './utils/logger'
import { getCachedAuthToken, setCachedAuthToken } from './server/utils/auth-cache'
import { decodeUserFromJwt } from './utils/convex-shared'
import type { ConvexUser } from './utils/types'
import type { AuthWaterfall, AuthWaterfallPhase } from './devtools/types'
import { getAuthSessionToken, resolveAuthEndpoints } from './utils/shared-helpers'

/**
 * Helper to build a waterfall phase entry (dev-only)
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

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = createLogger(logLevel)
  const endInit = logger.time('plugin:init (server)')

  // Check if auth is enabled
  const isAuthEnabled = config.public.convex?.auth as boolean | undefined
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

  const siteUrl = config.public.convex?.siteUrl as string | undefined
  const endpoints = resolveAuthEndpoints(siteUrl, config.public.convex?.authRoute as string | undefined)

  if (!endpoints) {
    // This shouldn't happen if module validation is working, but handle gracefully
    endInit()
    logger.debug('No siteUrl configured, auth disabled')
    return
  }

  // Helper to log auth events
  const logAuth = (phase: string, outcome: 'success' | 'error' | 'skip' | 'miss', details?: Record<string, unknown>, error?: Error) => {
    logger.auth({ phase, outcome, details, error })
  }

  // Initialize useState for hydration (must be done even if unauthenticated)
  const convexToken = useState<string | null>('convex:token', () => null)
  const convexUser = useState<ConvexUser | null>('convex:user', () => null)
  const convexAuthWaterfall = useState<AuthWaterfall | null>('convex:authWaterfall', () => null)

  // Waterfall tracking (dev-only)
  const trackWaterfall = import.meta.dev
  const waterfallStart = trackWaterfall ? Date.now() : 0
  const phases: AuthWaterfallPhase[] = []
  let cacheHit = false

  // Phase 1: Session Check
  const sessionCheckStart = trackWaterfall ? Date.now() : 0
  const cookieHeader = event.headers.get('cookie')
  // Try both cookie names: __Secure- prefix is used on HTTPS (production)
  const sessionToken = getAuthSessionToken(cookieHeader)

  // Check if we have a session cookie
  if (!cookieHeader || !sessionToken) {
    if (trackWaterfall) {
      phases.push(buildPhase('session-check', sessionCheckStart, waterfallStart, 'miss', 'No session cookie'))
      convexAuthWaterfall.value = {
        requestId: crypto.randomUUID(),
        timestamp: waterfallStart,
        phases,
        totalDuration: Date.now() - waterfallStart,
        outcome: 'unauthenticated',
        cacheHit: false,
      }
    }
    endInit()
    logAuth('session-check', 'miss')
    return
  }

  if (trackWaterfall) {
    phases.push(buildPhase('session-check', sessionCheckStart, waterfallStart, 'success', 'Cookie found'))
  }

  // Get auth cache config
  const authCacheConfig = (config.public.convex as { authCache?: { enabled: boolean; ttl: number } })?.authCache

  try {
    let token: string | null = null

    // Phase 2: Cache Lookup (if enabled)
    if (authCacheConfig?.enabled && sessionToken) {
      const cacheStart = trackWaterfall ? Date.now() : 0
      token = await getCachedAuthToken(sessionToken)
      if (token) {
        // Cache hit - use cached token
        cacheHit = true
        if (trackWaterfall) {
          phases.push(buildPhase('cache-lookup', cacheStart, waterfallStart, 'hit', 'Token from cache'))
        }

        // Phase 3: JWT Decode (from cache)
        const decodeStart = trackWaterfall ? Date.now() : 0
        convexToken.value = token
        convexUser.value = decodeUserFromJwt(token)
        if (trackWaterfall) {
          phases.push(
            buildPhase('jwt-decode', decodeStart, waterfallStart, convexUser.value ? 'success' : 'error'),
          )
          convexAuthWaterfall.value = {
            requestId: crypto.randomUUID(),
            timestamp: waterfallStart,
            phases,
            totalDuration: Date.now() - waterfallStart,
            outcome: 'authenticated',
            cacheHit: true,
          }
        }

        endInit()
        logAuth('cache', 'success', { source: 'cache' })
        return
      } else if (trackWaterfall) {
        phases.push(buildPhase('cache-lookup', cacheStart, waterfallStart, 'miss', 'Cache miss'))
      }
    } else if (trackWaterfall && authCacheConfig?.enabled === false) {
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
    const exchangeStart = trackWaterfall ? Date.now() : 0
    const { tokenExchangeUrl, sessionUrl } = endpoints
    const tokenResponse = (await $fetch(tokenExchangeUrl, {
      headers: { Cookie: cookieHeader },
    }).catch(() => null)) as { token?: string } | null

    if (tokenResponse?.token) {
      if (trackWaterfall) {
        phases.push(
          buildPhase('token-exchange', exchangeStart, waterfallStart, 'success', tokenExchangeUrl),
        )
      }
      token = tokenResponse.token
      convexToken.value = token

      // Phase 4: JWT Decode
      const decodeStart = trackWaterfall ? Date.now() : 0
      convexUser.value = decodeUserFromJwt(token)

      // If decode failed, fallback to session endpoint
      if (!convexUser.value) {
        const sessionResponse = (await $fetch(sessionUrl, {
          headers: { Cookie: cookieHeader },
        }).catch(() => null)) as { user?: ConvexUser } | null
        if (sessionResponse?.user) {
          convexUser.value = sessionResponse.user
        }
        if (trackWaterfall) {
          phases.push(
            buildPhase('jwt-decode', decodeStart, waterfallStart, 'success', 'Fallback to session endpoint'),
          )
        }
      } else if (trackWaterfall) {
        phases.push(buildPhase('jwt-decode', decodeStart, waterfallStart, 'success'))
      }

      // Phase 5: Cache Store (if caching is enabled)
      if (authCacheConfig?.enabled && sessionToken && token) {
        const storeStart = trackWaterfall ? Date.now() : 0
        const ttl = authCacheConfig.ttl ?? 900
        await setCachedAuthToken(sessionToken, token, ttl)
        if (trackWaterfall) {
          phases.push(buildPhase('cache-store', storeStart, waterfallStart, 'success', `TTL: ${ttl}s`))
        }
      }

      endInit()
      logAuth('exchange', 'success', { user: convexUser.value?.email })
    } else {
      if (trackWaterfall) {
        phases.push(buildPhase('token-exchange', exchangeStart, waterfallStart, 'error', 'No token returned'))
      }
      endInit()
      logAuth('exchange', 'miss')
    }

    // Store waterfall (dev-only)
    if (trackWaterfall) {
      convexAuthWaterfall.value = {
        requestId: crypto.randomUUID(),
        timestamp: waterfallStart,
        phases,
        totalDuration: Date.now() - waterfallStart,
        outcome: convexToken.value ? 'authenticated' : 'unauthenticated',
        cacheHit,
      }
    }
  } catch (error) {
    // Token exchange failed - session may be invalid/expired
    convexToken.value = null
    convexUser.value = null

    // Store waterfall with error (dev-only)
    if (trackWaterfall) {
      convexAuthWaterfall.value = {
        requestId: crypto.randomUUID(),
        timestamp: waterfallStart,
        phases,
        totalDuration: Date.now() - waterfallStart,
        outcome: 'error',
        cacheHit: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      }
    }

    endInit()
    logAuth('exchange', 'error', undefined, error instanceof Error ? error : new Error('Token exchange failed'))
  }
})
