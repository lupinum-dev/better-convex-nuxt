import type { H3Event } from 'h3'

import type { AuthWaterfallPhase } from '../../utils/auth-debug'
import { SERVER_FETCH_TIMEOUT_MS } from '../../utils/constants'
import {
  buildMissingSiteUrlMessage,
  buildTokenExchangeFailureMessage,
} from '../../utils/auth-errors'
import { decodeUserFromJwt } from '../../utils/convex-shared'
import type { NormalizedConvexRuntimeConfig } from '../../utils/runtime-config'
import { getBetterAuthSessionToken } from '../../utils/auth-token'
import type { ConvexUser, ConvexServerAuthMode } from '../../utils/types'
import { getCachedAuthToken, setCachedAuthToken } from './auth-cache'
import { fetchWithTimeout } from './http'

interface AuthResolutionMemoContext {
  __betterConvexRequestAuthPromise?: Promise<ResolvedRequestAuth>
}

export interface AuthResolutionTrace {
  startedAt: number
  totalDuration: number
  phases: AuthWaterfallPhase[]
  outcome: 'authenticated' | 'unauthenticated' | 'error'
  cacheHit: boolean
  error?: string
}

export interface ResolvedRequestAuth {
  token: string | null
  user: ConvexUser | null
  error: string | null
  source: 'cache' | 'exchange' | 'none'
  hasSessionCookie: boolean
  sessionToken: string | null
  missingSiteUrl: boolean
  cacheHit: boolean
  jwtDecodeFailed: boolean
  tokenExchangeStatus: number | null
  tokenExchangeError: Error | null
  isMisconfigError: boolean
  trace: AuthResolutionTrace
}

function getCookieHeader(event: H3Event): string {
  const directHeader = (event as { headers?: { get?: (name: string) => string | null } }).headers
  if (directHeader?.get) {
    return directHeader.get('cookie') ?? ''
  }

  const nodeHeaders = (
    event as { node?: { req?: { headers?: Record<string, string | string[] | undefined> } } }
  ).node?.req?.headers
  const raw = nodeHeaders?.cookie
  if (Array.isArray(raw)) return raw.join('; ')
  return typeof raw === 'string' ? raw : ''
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

function withTrace(
  startedAt: number,
  totalDuration: number,
  phases: AuthWaterfallPhase[],
  cacheHit: boolean,
  outcome: AuthResolutionTrace['outcome'],
  error?: string,
): AuthResolutionTrace {
  return { startedAt, totalDuration, phases, cacheHit, outcome, error }
}

async function resolveRequestAuthUncached(
  event: H3Event,
  config: NormalizedConvexRuntimeConfig,
): Promise<ResolvedRequestAuth> {
  const waterfallStart = Date.now()
  const buildTrace = (
    outcome: AuthResolutionTrace['outcome'],
    cacheHit: boolean,
    error?: string,
  ) => withTrace(waterfallStart, Date.now() - waterfallStart, phases, cacheHit, outcome, error)
  const phases: AuthWaterfallPhase[] = []
  const cookieHeader = getCookieHeader(event)
  const sessionCheckStart = Date.now()
  const sessionToken = getBetterAuthSessionToken(cookieHeader)
  const hasSessionCookie = Boolean(sessionToken)

  phases.push(
    buildPhase(
      'session-check',
      sessionCheckStart,
      waterfallStart,
      hasSessionCookie ? 'success' : 'miss',
      hasSessionCookie ? 'Cookie found' : 'No session cookie',
    ),
  )

  if (!config.siteUrl) {
    const error = buildMissingSiteUrlMessage(config.url)
    return {
      token: null,
      user: null,
      error,
      source: 'none',
      hasSessionCookie,
      sessionToken,
      missingSiteUrl: true,
      cacheHit: false,
      jwtDecodeFailed: false,
      tokenExchangeStatus: null,
      tokenExchangeError: null,
      isMisconfigError: false,
      trace: buildTrace('error', false, error),
    }
  }

  if (!sessionToken) {
    return {
      token: null,
      user: null,
      error: null,
      source: 'none',
      hasSessionCookie: false,
      sessionToken: null,
      missingSiteUrl: false,
      cacheHit: false,
      jwtDecodeFailed: false,
      tokenExchangeStatus: null,
      tokenExchangeError: null,
      isMisconfigError: false,
      trace: buildTrace('unauthenticated', false),
    }
  }

  const cacheEnabled = config.auth.cache?.enabled === true
  const cacheTtlSeconds = config.auth.cache?.ttl ?? 60
  let cacheHit = false

  try {
    if (cacheEnabled) {
      const cacheStart = Date.now()
      const cachedToken = await getCachedAuthToken(sessionToken)
      if (cachedToken) {
        cacheHit = true
        phases.push(buildPhase('cache-lookup', cacheStart, waterfallStart, 'hit', 'Token from cache'))

        const decodeStart = Date.now()
        const user = decodeUserFromJwt(cachedToken)
        const jwtDecodeFailed = !user
        phases.push(
          buildPhase(
            'jwt-decode',
            decodeStart,
            waterfallStart,
            user ? 'success' : 'error',
            user ? undefined : 'JWT decode failed — no user claims in token',
          ),
        )

        return {
          token: cachedToken,
          user,
          error: null,
          source: 'cache',
          hasSessionCookie: true,
          sessionToken,
          missingSiteUrl: false,
          cacheHit: true,
          jwtDecodeFailed,
          tokenExchangeStatus: null,
          tokenExchangeError: null,
          isMisconfigError: false,
          trace: buildTrace('authenticated', true),
        }
      }

      phases.push(buildPhase('cache-lookup', cacheStart, waterfallStart, 'miss', 'Cache miss'))
    } else {
      phases.push({
        name: 'cache-lookup',
        start: 0,
        end: 0,
        duration: 0,
        result: 'skipped',
        details: 'Cache disabled',
      })
    }

    const exchangeStart = Date.now()
    let tokenExchangeStatus: number | null = null
    let tokenExchangeError: Error | null = null
    let tokenResponse: { token?: string } | null = null

    try {
      const response = await fetchWithTimeout(`${config.siteUrl}/api/auth/convex/token`, {
        headers: { Cookie: cookieHeader },
        timeoutMs: SERVER_FETCH_TIMEOUT_MS,
      })
      tokenExchangeStatus = response.status
      if (response.ok) {
        tokenResponse = (await response.json().catch(() => null)) as { token?: string } | null
      }
    } catch (error) {
      tokenExchangeError = error instanceof Error ? error : new Error(String(error))
    }

    if (tokenResponse?.token) {
      phases.push(
        buildPhase(
          'token-exchange',
          exchangeStart,
          waterfallStart,
          'success',
          `${config.siteUrl}/api/auth/convex/token`,
        ),
      )

      const decodeStart = Date.now()
      const user = decodeUserFromJwt(tokenResponse.token)
      const jwtDecodeFailed = !user
      phases.push(
        buildPhase(
          'jwt-decode',
          decodeStart,
          waterfallStart,
          user ? 'success' : 'error',
          user ? undefined : 'JWT decode failed — no user claims in token',
        ),
      )

      if (cacheEnabled) {
        const cacheStoreStart = Date.now()
        await setCachedAuthToken(sessionToken, tokenResponse.token, cacheTtlSeconds)
        phases.push(
          buildPhase(
            'cache-store',
            cacheStoreStart,
            waterfallStart,
            'success',
            `TTL: ${cacheTtlSeconds}s`,
          ),
        )
      }

      return {
        token: tokenResponse.token,
        user,
        error: null,
        source: 'exchange',
        hasSessionCookie: true,
        sessionToken,
        missingSiteUrl: false,
        cacheHit,
        jwtDecodeFailed,
        tokenExchangeStatus,
        tokenExchangeError,
        isMisconfigError: false,
        trace: buildTrace('authenticated', cacheHit),
      }
    }

    const isMisconfigError =
      Boolean(tokenExchangeError) ||
      tokenExchangeStatus === 404 ||
      (tokenExchangeStatus !== null && tokenExchangeStatus >= 500)
    const error = isMisconfigError
      ? buildTokenExchangeFailureMessage({
          siteUrl: config.siteUrl,
          status: tokenExchangeStatus ?? undefined,
          error: tokenExchangeError ?? undefined,
        })
      : null

    phases.push(
      buildPhase(
        'token-exchange',
        exchangeStart,
        waterfallStart,
        isMisconfigError ? 'error' : 'miss',
        tokenExchangeStatus ? `HTTP ${tokenExchangeStatus}` : 'No token returned',
      ),
    )

    return {
      token: null,
      user: null,
      error,
      source: 'exchange',
      hasSessionCookie: true,
      sessionToken,
      missingSiteUrl: false,
      cacheHit,
      jwtDecodeFailed: false,
      tokenExchangeStatus,
      tokenExchangeError,
      isMisconfigError,
      trace: buildTrace(isMisconfigError ? 'error' : 'unauthenticated', cacheHit, error ?? undefined),
    }
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error))
    const message = buildTokenExchangeFailureMessage({
      siteUrl: config.siteUrl,
      error: normalizedError,
    })

    return {
      token: null,
      user: null,
      error: message,
      source: 'exchange',
      hasSessionCookie: true,
      sessionToken,
      missingSiteUrl: false,
      cacheHit,
      jwtDecodeFailed: false,
      tokenExchangeStatus: null,
      tokenExchangeError: normalizedError,
      isMisconfigError: true,
      trace: buildTrace('error', cacheHit, normalizedError.message),
    }
  }
}

export async function resolveRequestAuth(
  event: H3Event,
  config: NormalizedConvexRuntimeConfig,
): Promise<ResolvedRequestAuth> {
  const eventWithContext = event as H3Event & {
    context: H3Event['context'] & AuthResolutionMemoContext
  }
  if (!event.context) {
    eventWithContext.context = {} as H3Event['context'] & AuthResolutionMemoContext
  }
  const context = eventWithContext.context
  if (context.__betterConvexRequestAuthPromise) {
    return await context.__betterConvexRequestAuthPromise
  }

  const promise = resolveRequestAuthUncached(event, config)
  context.__betterConvexRequestAuthPromise = promise

  try {
    return await promise
  } catch (error) {
    delete context.__betterConvexRequestAuthPromise
    throw error
  }
}

export async function resolveRequestAuthToken(
  event: H3Event,
  config: NormalizedConvexRuntimeConfig,
  options?: {
    auth?: ConvexServerAuthMode
    authToken?: string
  },
): Promise<string | undefined> {
  if (options?.authToken) {
    return options.authToken
  }

  const auth = options?.auth ?? 'auto'
  if (auth === 'none') {
    return undefined
  }

  const cookieHeader = getCookieHeader(event)
  if (!getBetterAuthSessionToken(cookieHeader)) {
    if (auth === 'required') {
      throw new Error(
        '[serverConvex] Authentication required but no Better Auth session cookie was found',
      )
    }
    return undefined
  }

  const resolved = await resolveRequestAuth(event, config)
  if (resolved.token) {
    return resolved.token
  }

  if (resolved.missingSiteUrl && auth === 'required') {
    throw new Error('[serverConvex] Authentication required but convex.siteUrl is not configured')
  }

  if (resolved.error && auth === 'required') {
    throw new Error(resolved.error)
  }

  if (auth === 'required') {
    throw new Error('[serverConvex] Authentication required but token exchange returned no token')
  }

  return undefined
}
