import type { AuthWaterfall, AuthWaterfallPhase } from '../../devtools/types'
import { buildTokenExchangeFailureMessage } from '../../utils/auth-errors'
import { decodeUserFromJwt, isJwtUsable } from '../../utils/convex-shared'
import { filterBetterAuthCookies, getBetterAuthSessionToken } from '../../utils/shared-helpers'
import type { ConvexUser } from '../../utils/types'
import { exchangeConvexToken } from './token-exchange'

type AuthLogOutcome = 'success' | 'error' | 'skip' | 'miss'

/**
 * Generic message hydrated to the client in production when token exchange
 * fails. The detailed diagnostic (secret/file hints, upstream error text)
 * still reaches server-side log events via ServerAuthLogEvent.details - it
 * just never reaches the client-visible snapshot outside dev.
 */
const GENERIC_AUTH_ERROR_MESSAGE = 'Authentication is temporarily unavailable'

/**
 * Truncate a user id for debug logs. Log events are debug-gated but
 * still land in server logs / log aggregators; a full email is PII that
 * doesn't need to be there just to correlate log lines to a session.
 */
function truncateUserIdForLog(id: string | null | undefined): string | undefined {
  if (!id) return undefined
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`
}

export interface ServerAuthLogEvent {
  phase: string
  outcome: AuthLogOutcome
  details?: Record<string, unknown>
  error?: Error
}

export interface ResolveServerAuthSnapshotOptions {
  siteUrl: string
  cookieHeader: string | null
  requestId: string
  trackWaterfall: boolean
  throwOnMisconfig: boolean
  /**
   * Whether the client-visible `authError` may include implementation
   * details (secret names, file hints, raw upstream error text). Pass
   * `import.meta.dev` from callers. When false, a generic message is
   * hydrated instead - the detailed message still flows into `logEvents`.
   */
  revealAuthErrorDetails: boolean
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

export async function resolveServerAuthSnapshot(
  options: ResolveServerAuthSnapshotOptions,
): Promise<ServerAuthSnapshot> {
  const {
    siteUrl,
    cookieHeader,
    requestId,
    trackWaterfall,
    throwOnMisconfig,
    revealAuthErrorDetails,
  } = options
  const waterfallStart = trackWaterfall ? Date.now() : 0
  const phases: AuthWaterfallPhase[] = []
  const logEvents: ServerAuthLogEvent[] = []
  const cacheHit = false
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
  const sessionToken = getBetterAuthSessionToken(cookieHeader)
  const authCookieHeader = filterBetterAuthCookies(cookieHeader)

  logEvents.push({
    phase: 'server-init',
    outcome: 'success',
    details: {
      hasCookieHeader: Boolean(cookieHeader),
      hasSessionToken: Boolean(sessionToken),
    },
  })

  if (!authCookieHeader || !sessionToken) {
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
    if (trackWaterfall) {
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
    const exchange = await exchangeConvexToken({
      siteUrl,
      credential: { type: 'cookie', value: authCookieHeader },
      timeoutMs: 5_000,
    })
    const tokenExchangeStatus = exchange.status
    const tokenExchangeThrown = exchange.status === undefined ? exchange.error : undefined
    const unusableHydrationToken = Boolean(exchange.token && !isJwtUsable(exchange.token))

    if (exchange.token && !unusableHydrationToken) {
      token = exchange.token
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
        // Keep this fail-closed assertion at the display boundary; do not
        // create a second identity path through /get-session.
        throw new Error('Convex token exchange returned an invalid display identity')
      }
      if (trackWaterfall) {
        phases.push(buildPhase('jwt-decode', decodeStart, waterfallStart, 'success'))
      }

      logEvents.push({
        phase: 'exchange',
        outcome: 'success',
        details: { userId: truncateUserIdForLog(user?.id) },
      })
      return {
        token,
        user,
        authError,
        waterfall: buildWaterfall('authenticated'),
        logEvents,
        devError: null,
      }
    }

    const isDefinitiveAuthMiss = tokenExchangeStatus === 401 || tokenExchangeStatus === 403
    const isExchangeFailure =
      unusableHydrationToken || (exchange.error !== null && !isDefinitiveAuthMiss)

    // Full diagnostic (secret names, file hints, raw upstream error text) -
    // safe for server logs/dev error pages, never for the client in prod.
    const detailedExchangeError = isExchangeFailure
      ? buildTokenExchangeFailureMessage({
          siteUrl,
          status: tokenExchangeStatus,
          error:
            tokenExchangeThrown ??
            exchange.error ??
            (unusableHydrationToken
              ? new Error('Convex token exchange returned an expired or malformed token')
              : undefined),
        })
      : null

    authError = isExchangeFailure
      ? revealAuthErrorDetails
        ? detailedExchangeError
        : GENERIC_AUTH_ERROR_MESSAGE
      : null

    if (trackWaterfall) {
      phases.push(
        buildPhase(
          'token-exchange',
          exchangeStart,
          waterfallStart,
          isExchangeFailure ? 'error' : 'miss',
          tokenExchangeStatus ? `HTTP ${tokenExchangeStatus}` : 'No token returned',
        ),
      )
    }

    devError =
      throwOnMisconfig && isExchangeFailure
        ? new Error(detailedExchangeError ?? 'Convex auth token exchange failed')
        : null

    const exchangeLogDetails: Record<string, unknown> | undefined = tokenExchangeStatus
      ? { status: tokenExchangeStatus }
      : undefined

    logEvents.push({
      phase: 'exchange',
      outcome: isExchangeFailure ? 'error' : 'miss',
      // Detailed message always lands in server logs, regardless of env.
      details: detailedExchangeError
        ? { ...(exchangeLogDetails ?? {}), message: detailedExchangeError }
        : exchangeLogDetails,
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
    const detailedError = buildTokenExchangeFailureMessage({ siteUrl, error })
    authError = revealAuthErrorDetails ? detailedError : GENERIC_AUTH_ERROR_MESSAGE
    const err = error instanceof Error ? error : new Error(detailedError)
    logEvents.push({
      phase: 'exchange',
      outcome: 'error',
      error: err,
      details: { message: detailedError },
    })

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
