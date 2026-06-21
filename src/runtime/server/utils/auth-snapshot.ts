import type { AuthWaterfall, AuthWaterfallPhase } from '../../devtools/types'
import { buildTokenExchangeFailureMessage } from '../../utils/auth-errors'
import { decodeUserFromJwt } from '../../utils/convex-shared'
import { getCookie } from '../../utils/shared-helpers'
import type { ConvexUser } from '../../utils/types'
import { getCachedAuthToken, setCachedAuthToken } from './auth-cache'
import { fetchWithTimeout } from './http'

/** Session cookie name used by Better Auth */
const SESSION_COOKIE_NAME = 'better-auth.session_token'
/** Secure cookie name used by Better Auth on HTTPS */
const SECURE_SESSION_COOKIE_NAME = '__Secure-better-auth.session_token'

type AuthLogOutcome = 'success' | 'error' | 'skip' | 'miss'

export interface ServerAuthLogEvent {
  phase: string
  outcome: AuthLogOutcome
  details?: Record<string, unknown>
  error?: Error
}

export interface ResolveServerAuthSnapshotOptions {
  siteUrl: string
  cookieHeader: string | null
  authCache: {
    enabled: boolean
    ttl: number
  }
  requestId: string
  trackWaterfall: boolean
  throwOnMisconfig: boolean
}

export interface ServerAuthSnapshot {
  token: string | null
  user: ConvexUser | null
  authError: string | null
  waterfall: AuthWaterfall | null
  logEvents: ServerAuthLogEvent[]
  devError: Error | null
}

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

async function fetchSessionUser(siteUrl: string, cookieHeader: string): Promise<ConvexUser | null> {
  try {
    const sessionFetch = await fetchWithTimeout(`${siteUrl}/api/auth/get-session`, {
      headers: { Cookie: cookieHeader },
      timeoutMs: 5_000,
    })
    if (!sessionFetch.ok) return null
    const sessionResponse = (await sessionFetch.json().catch(() => null)) as {
      user?: ConvexUser
    } | null
    return sessionResponse?.user ?? null
  } catch {
    return null
  }
}

export async function resolveServerAuthSnapshot(
  options: ResolveServerAuthSnapshotOptions,
): Promise<ServerAuthSnapshot> {
  const { siteUrl, cookieHeader, authCache, requestId, trackWaterfall, throwOnMisconfig } = options
  const waterfallStart = trackWaterfall ? Date.now() : 0
  const phases: AuthWaterfallPhase[] = []
  const logEvents: ServerAuthLogEvent[] = []
  let cacheHit = false
  let token: string | null = null
  let user: ConvexUser | null = null
  let authError: string | null = null
  let devError: Error | null = null

  const buildWaterfall = (
    outcome: AuthWaterfall['outcome'],
    error?: string,
  ): AuthWaterfall | null =>
    trackWaterfall
      ? {
          requestId,
          timestamp: waterfallStart,
          phases,
          totalDuration: Date.now() - waterfallStart,
          outcome,
          cacheHit,
          error,
        }
      : null

  const sessionCheckStart = trackWaterfall ? Date.now() : 0
  const sessionToken =
    getCookie(cookieHeader, SECURE_SESSION_COOKIE_NAME) ||
    getCookie(cookieHeader, SESSION_COOKIE_NAME)

  logEvents.push({
    phase: 'server-init',
    outcome: 'success',
    details: {
      hasCookieHeader: Boolean(cookieHeader),
      hasSessionToken: Boolean(sessionToken),
      cacheEnabled: authCache.enabled,
    },
  })

  if (!cookieHeader || !sessionToken) {
    if (trackWaterfall) {
      phases.push(
        buildPhase('session-check', sessionCheckStart, waterfallStart, 'miss', 'No session cookie'),
      )
    }
    logEvents.push({ phase: 'session-check', outcome: 'miss' })
    return {
      token: null,
      user: null,
      authError: null,
      waterfall: buildWaterfall('unauthenticated'),
      logEvents,
      devError: null,
    }
  }

  if (trackWaterfall) {
    phases.push(
      buildPhase('session-check', sessionCheckStart, waterfallStart, 'success', 'Cookie found'),
    )
  }

  try {
    if (authCache.enabled) {
      const cacheStart = trackWaterfall ? Date.now() : 0
      token = await getCachedAuthToken(sessionToken)
      if (token) {
        cacheHit = true
        if (trackWaterfall) {
          phases.push(
            buildPhase('cache-lookup', cacheStart, waterfallStart, 'hit', 'Token from cache'),
          )
        }

        const decodeStart = trackWaterfall ? Date.now() : 0
        user = decodeUserFromJwt(token)
        if (!user) {
          user = await fetchSessionUser(siteUrl, cookieHeader)
        }
        if (trackWaterfall) {
          phases.push(
            buildPhase(
              'jwt-decode',
              decodeStart,
              waterfallStart,
              user ? 'success' : 'error',
              user ? undefined : 'Cache hit decode fallback failed',
            ),
          )
        }

        logEvents.push({ phase: 'cache', outcome: 'success', details: { source: 'cache' } })
        return {
          token,
          user,
          authError: null,
          waterfall: buildWaterfall('authenticated'),
          logEvents,
          devError: null,
        }
      }

      if (trackWaterfall) {
        phases.push(buildPhase('cache-lookup', cacheStart, waterfallStart, 'miss', 'Cache miss'))
      }
    } else if (trackWaterfall) {
      phases.push({
        name: 'cache-lookup',
        start: 0,
        end: 0,
        duration: 0,
        result: 'skipped',
        details: 'Cache disabled',
      })
    }

    const exchangeStart = trackWaterfall ? Date.now() : 0
    let tokenResponse: { token?: string } | null = null
    let tokenExchangeStatus: number | undefined
    let tokenExchangeThrown: unknown

    try {
      const response = await fetchWithTimeout(`${siteUrl}/api/auth/convex/token`, {
        headers: { Cookie: cookieHeader },
        timeoutMs: 5_000,
      })
      tokenExchangeStatus = response.status
      if (response.ok) {
        tokenResponse = (await response.json().catch(() => null)) as { token?: string } | null
      }
    } catch (error) {
      tokenExchangeThrown = error
    }

    if (tokenResponse?.token) {
      token = tokenResponse.token
      authError = null

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

      const decodeStart = trackWaterfall ? Date.now() : 0
      user = decodeUserFromJwt(token)
      if (!user) {
        user = await fetchSessionUser(siteUrl, cookieHeader)
        if (trackWaterfall) {
          phases.push(
            buildPhase(
              'jwt-decode',
              decodeStart,
              waterfallStart,
              'success',
              'Fallback to session endpoint',
            ),
          )
        }
      } else if (trackWaterfall) {
        phases.push(buildPhase('jwt-decode', decodeStart, waterfallStart, 'success'))
      }

      if (authCache.enabled && token) {
        const storeStart = trackWaterfall ? Date.now() : 0
        await setCachedAuthToken(sessionToken, token, authCache.ttl)
        if (trackWaterfall) {
          phases.push(
            buildPhase(
              'cache-store',
              storeStart,
              waterfallStart,
              'success',
              `TTL: ${authCache.ttl}s`,
            ),
          )
        }
      }

      logEvents.push({ phase: 'exchange', outcome: 'success', details: { user: user?.email } })
      return {
        token,
        user,
        authError,
        waterfall: buildWaterfall('authenticated'),
        logEvents,
        devError: null,
      }
    }

    const likelyMisconfig =
      Boolean(tokenExchangeThrown) ||
      tokenExchangeStatus === 404 ||
      (tokenExchangeStatus !== undefined && tokenExchangeStatus >= 500)

    authError = likelyMisconfig
      ? buildTokenExchangeFailureMessage({
          siteUrl,
          status: tokenExchangeStatus,
          error: tokenExchangeThrown,
        })
      : null

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

    devError =
      throwOnMisconfig && likelyMisconfig
        ? new Error(authError ?? 'Convex auth token exchange failed')
        : null

    logEvents.push({
      phase: 'exchange',
      outcome: likelyMisconfig ? 'error' : 'miss',
      details: tokenExchangeStatus ? { status: tokenExchangeStatus } : undefined,
      error: tokenExchangeThrown instanceof Error ? tokenExchangeThrown : undefined,
    })

    return {
      token: null,
      user: null,
      authError,
      waterfall: buildWaterfall(devError ? 'error' : 'unauthenticated', devError?.message),
      logEvents,
      devError,
    }
  } catch (error) {
    authError = buildTokenExchangeFailureMessage({ siteUrl, error })
    const err = error instanceof Error ? error : new Error(authError)
    logEvents.push({ phase: 'exchange', outcome: 'error', error: err })

    return {
      token: null,
      user: null,
      authError,
      waterfall: buildWaterfall('error', err.message),
      logEvents,
      devError: throwOnMisconfig ? err : null,
    }
  }
}
