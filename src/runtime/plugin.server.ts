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

import type { AuthWaterfall, AuthWaterfallPhase } from './utils/auth-debug'
import { getCachedAuthToken, setCachedAuthToken } from './server/utils/auth-cache'
import { fetchWithTimeout } from './server/utils/http'
import {
  SERVER_FETCH_TIMEOUT_MS,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_AUTH_WATERFALL,
} from './utils/constants'
import {
  buildAuthProxyUnreachableMessage,
  buildAuthProxyUpstreamStatusMessage,
  buildMissingSiteUrlMessage,
  buildTokenExchangeFailureMessage,
} from './utils/auth-errors'
import { decodeUserFromJwt } from './utils/convex-shared'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import { getCookie } from './utils/shared-helpers'
import type { ConvexUser } from './utils/types'

/** Session cookie name used by Better Auth */
const SESSION_COOKIE_NAME = 'better-auth.session_token'
/** Secure cookie name (used on HTTPS in production) */
const SECURE_SESSION_COOKIE_NAME = '__Secure-better-auth.session_token'
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
    const convexAuthError = useState<string | null>(STATE_KEY_AUTH_ERROR, () => null)
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
  const convexToken = useState<string | null>(STATE_KEY_TOKEN, () => null)
  const convexUser = useState<ConvexUser | null>(STATE_KEY_USER, () => null)
  const convexAuthError = useState<string | null>(STATE_KEY_AUTH_ERROR, () => null)
  // authWaterfall is dev-only — skip allocation in production to avoid serializing dead state
  const convexAuthWaterfall = import.meta.dev
    ? useState<AuthWaterfall | null>(STATE_KEY_AUTH_WATERFALL, () => null)
    : { value: null as AuthWaterfall | null }

  // Waterfall tracking (dev-only)
  const trackWaterfall = import.meta.dev
  const waterfallStart = trackWaterfall ? Date.now() : 0
  const phases: AuthWaterfallPhase[] = []
  let cacheHit = false
  // Get auth cache config
  const authCacheConfig = convexConfig.auth.cache

  // Phase 1: Session Check
  const sessionCheckStart = trackWaterfall ? Date.now() : 0
  const cookieHeader = event.headers.get('cookie')
  // Try both cookie names: __Secure- prefix is used on HTTPS (production)
  const sessionToken =
    getCookie(cookieHeader, SECURE_SESSION_COOKIE_NAME) ||
    getCookie(cookieHeader, SESSION_COOKIE_NAME)
  logAuth('server-init', 'success', {
    hasCookieHeader: Boolean(cookieHeader),
    hasSessionToken: Boolean(sessionToken),
    cacheEnabled: Boolean(authCacheConfig?.enabled),
  })

  if (!cookieHeader || !sessionToken) {
    convexAuthError.value = null
    if (trackWaterfall) {
      phases.push(
        buildPhase('session-check', sessionCheckStart, waterfallStart, 'miss', 'No session cookie'),
      )
      convexAuthWaterfall.value = {
        requestId,
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
    phases.push(
      buildPhase('session-check', sessionCheckStart, waterfallStart, 'success', 'Cookie found'),
    )
  }

  try {
    let token: string | null = null
    let tokenExchangeStatus: number | undefined
    let tokenExchangeThrown: unknown

    // Phase 2: Cache Lookup (if enabled)
    if (authCacheConfig?.enabled && sessionToken) {
      const cacheStart = trackWaterfall ? Date.now() : 0
      token = await getCachedAuthToken(sessionToken)
      if (token) {
        // Cache hit - use cached token
        cacheHit = true
        if (trackWaterfall) {
          phases.push(
            buildPhase('cache-lookup', cacheStart, waterfallStart, 'hit', 'Token from cache'),
          )
        }

        // Phase 3: JWT Decode (from cache)
        const decodeStart = trackWaterfall ? Date.now() : 0
        convexToken.value = token
        convexUser.value = decodeUserFromJwt(token)
        if (!convexUser.value && import.meta.dev) {
          console.warn(
            '[better-convex-nuxt] JWT decode failed — user info unavailable for this SSR render. Configure Better Auth to include user claims in the JWT.',
          )
        }
        if (trackWaterfall) {
          phases.push(
            buildPhase(
              'jwt-decode',
              decodeStart,
              waterfallStart,
              convexUser.value ? 'success' : 'error',
              convexUser.value ? undefined : 'JWT decode failed — no user claims in token',
            ),
          )
          convexAuthWaterfall.value = {
            requestId,
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
    let tokenResponse: { token?: string } | null = null
    try {
      const response = await fetchWithTimeout(`${siteUrl}/api/auth/convex/token`, {
        headers: { Cookie: cookieHeader },
        timeoutMs: SERVER_FETCH_TIMEOUT_MS,
      })
      tokenExchangeStatus = response.status
      if (response.ok) {
        tokenResponse = (await response.json().catch(() => null)) as { token?: string } | null
      }
    } catch (error) {
      tokenExchangeThrown = error
    }

    if (tokenResponse?.token) {
      if (trackWaterfall) {
        phases.push(
          buildPhase(
            'token-exchange',
            exchangeStart,
            waterfallStart,
            'success',
            `${siteUrl}/api/auth/convex/token`,
          ),
        )
      }
      token = tokenResponse.token
      convexToken.value = token
      convexAuthError.value = null

      // Phase 4: JWT Decode
      const decodeStart = trackWaterfall ? Date.now() : 0
      convexUser.value = decodeUserFromJwt(token)

      if (!convexUser.value && import.meta.dev) {
        console.warn(
          '[better-convex-nuxt] JWT decode failed — user info unavailable for this SSR render. Configure Better Auth to include user claims in the JWT.',
        )
      }
      if (trackWaterfall) {
        phases.push(
          buildPhase(
            'jwt-decode',
            decodeStart,
            waterfallStart,
            convexUser.value ? 'success' : 'error',
            convexUser.value ? undefined : 'JWT decode failed — no user claims in token',
          ),
        )
      }

      // Phase 5: Cache Store (if caching is enabled)
      if (authCacheConfig?.enabled && sessionToken && token) {
        const storeStart = trackWaterfall ? Date.now() : 0
        const ttl = authCacheConfig.ttl ?? 60
        await setCachedAuthToken(sessionToken, token, ttl)
        if (trackWaterfall) {
          phases.push(
            buildPhase('cache-store', storeStart, waterfallStart, 'success', `TTL: ${ttl}s`),
          )
        }
      }

      endInit()
      logAuth('exchange', 'success', { user: convexUser.value?.email })
    } else {
      const likelyMisconfig =
        Boolean(tokenExchangeThrown) ||
        tokenExchangeStatus === 404 ||
        (tokenExchangeStatus !== undefined && tokenExchangeStatus >= 500)
      if (likelyMisconfig) {
        convexAuthError.value = buildTokenExchangeFailureMessage({
          siteUrl,
          status: tokenExchangeStatus,
          error: tokenExchangeThrown,
        })
      } else {
        convexAuthError.value = null
      }
      if (trackWaterfall) {
        phases.push(
          buildPhase(
            'token-exchange',
            exchangeStart,
            waterfallStart,
            likelyMisconfig ? 'error' : 'miss',
            tokenExchangeStatus ? `HTTP ${tokenExchangeStatus}` : 'No token returned',
          ),
        )
      }
      if (import.meta.dev && likelyMisconfig) {
        throw new Error(convexAuthError.value ?? 'Convex auth token exchange failed')
      }

      endInit()
      logAuth(
        'exchange',
        likelyMisconfig ? 'error' : 'miss',
        tokenExchangeStatus ? { status: tokenExchangeStatus } : undefined,
        tokenExchangeThrown instanceof Error ? tokenExchangeThrown : undefined,
      )
    }

    // Store waterfall (dev-only)
    if (trackWaterfall) {
      convexAuthWaterfall.value = {
        requestId,
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
    convexAuthError.value = buildTokenExchangeFailureMessage({ siteUrl, error })

    // Store waterfall with error (dev-only)
    if (trackWaterfall) {
      convexAuthWaterfall.value = {
        requestId,
        timestamp: waterfallStart,
        phases,
        totalDuration: Date.now() - waterfallStart,
        outcome: 'error',
        cacheHit: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      }
    }

    endInit()
    logAuth(
      'exchange',
      'error',
      undefined,
      error instanceof Error ? error : new Error(convexAuthError.value),
    )

    if (import.meta.dev) {
      throw error instanceof Error ? error : new Error(convexAuthError.value)
    }
  }
})
