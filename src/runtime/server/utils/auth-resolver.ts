import type { H3Event } from 'h3'

import type { AuthWaterfallPhase } from '../../utils/auth-debug.js'
import {
  buildMissingSiteUrlMessage,
  buildTokenExchangeFailureMessage,
} from '../../utils/auth-errors.js'
import { getBetterAuthSessionToken } from '../../utils/auth-token.js'
import { SERVER_FETCH_TIMEOUT_MS } from '../../utils/constants.js'
import { decodeUserFromJwt } from '../../utils/convex-shared.js'
import type { NormalizedConvexRuntimeConfig } from '../../utils/runtime-config.js'
import type { ConvexUser, ConvexServerAuthMode } from '../../utils/types.js'
import { getCachedAuthToken, setCachedAuthToken } from './auth-cache.js'
import { fetchWithTimeout } from './http.js'

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
  /** True when a session cookie is present but the auth endpoint returned 401/403 (revoked session, secret mismatch, etc.) */
  isSessionRejected: boolean
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

function getHeader(event: H3Event, name: string): string | null {
  const lowerName = name.toLowerCase()
  const directHeader = (event as { headers?: { get?: (header: string) => string | null } }).headers
  if (directHeader?.get) {
    return directHeader.get(lowerName) ?? directHeader.get(name) ?? null
  }

  const nodeHeaders = (
    event as { node?: { req?: { headers?: Record<string, string | string[] | undefined> } } }
  ).node?.req?.headers
  const raw = nodeHeaders?.[lowerName]
  if (Array.isArray(raw)) return raw[0] ?? null
  return typeof raw === 'string' ? raw : null
}

function resolveForwardedClientIp(event: H3Event): string | null {
  const trustedClientAddress = event.context?.clientAddress
  if (trustedClientAddress) {
    return trustedClientAddress
  }

  const remoteAddress = event.node?.req?.socket?.remoteAddress
  if (remoteAddress) {
    return remoteAddress
  }

  return getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

function buildServerTokenExchangeHeaders(
  event: H3Event,
  cookieHeader: string,
): Record<string, string> {
  const headers: Record<string, string> = { Cookie: cookieHeader }
  const forwardedHost = getHeader(event, 'x-forwarded-host') ?? getHeader(event, 'host')
  const explicitProto =
    getHeader(event, 'x-forwarded-proto') ??
    getHeader(event, 'x-forwarded-protocol') ??
    getHeader(event, 'x-forwarded-scheme')
  const forwardedFor = resolveForwardedClientIp(event)

  if (forwardedHost) {
    headers['x-forwarded-host'] = forwardedHost
  }
  if (explicitProto) {
    headers['x-forwarded-proto'] = explicitProto
  } else if (forwardedHost) {
    // Infer protocol from socket only when a proxy chain is present (forwarded host exists)
    const encrypted =
      (event as { node?: { req?: { socket?: { encrypted?: boolean } } } }).node?.req?.socket
        ?.encrypted ?? false
    headers['x-forwarded-proto'] = encrypted ? 'https' : 'http'
  }
  if (forwardedFor) {
    headers['x-forwarded-for'] = forwardedFor
  }

  return headers
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
  const buildTrace = (outcome: AuthResolutionTrace['outcome'], cacheHit: boolean, error?: string) =>
    withTrace(waterfallStart, Date.now() - waterfallStart, phases, cacheHit, outcome, error)
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
      isSessionRejected: false,
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
      isSessionRejected: false,
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
        phases.push(
          buildPhase('cache-lookup', cacheStart, waterfallStart, 'hit', 'Token from cache'),
        )

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
          isSessionRejected: false,
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
    let tokenExchangeBody: string | null = null
    let tokenResponse: { token?: string } | null = null

    try {
      const response = await fetchWithTimeout(`${config.siteUrl}/api/auth/convex/token`, {
        headers: buildServerTokenExchangeHeaders(event, cookieHeader),
        timeoutMs: SERVER_FETCH_TIMEOUT_MS,
      })
      tokenExchangeStatus = response.status
      if (response.ok) {
        try {
          tokenResponse = (await response.json()) as { token?: string } | null
        } catch {
          tokenExchangeError = new Error(
            'Token endpoint returned 200 but response was not valid JSON',
          )
        }
      } else {
        // Read upstream error body for diagnostic context
        tokenExchangeBody = await response.text().catch(() => null)
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
        isSessionRejected: false,
        trace: buildTrace('authenticated', cacheHit),
      }
    }

    const isMisconfigError =
      Boolean(tokenExchangeError) ||
      tokenExchangeStatus === 404 ||
      (tokenExchangeStatus !== null && tokenExchangeStatus >= 500)
    const isSessionRejected =
      !isMisconfigError && (tokenExchangeStatus === 401 || tokenExchangeStatus === 403)
    const bodyDetail = tokenExchangeBody ? ` ${tokenExchangeBody.slice(0, 500)}` : ''
    const error = isMisconfigError
      ? buildTokenExchangeFailureMessage({
          siteUrl: config.siteUrl,
          status: tokenExchangeStatus ?? undefined,
          error: tokenExchangeError ?? undefined,
        }) + bodyDetail
      : isSessionRejected
        ? `Session cookie present but rejected by auth endpoint (HTTP ${tokenExchangeStatus}).${bodyDetail} The session may have been revoked or the auth secret may have changed.`
        : null

    phases.push(
      buildPhase(
        'token-exchange',
        exchangeStart,
        waterfallStart,
        isMisconfigError || isSessionRejected ? 'error' : 'miss',
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
      isSessionRejected,
      trace: buildTrace(
        isMisconfigError || isSessionRejected ? 'error' : 'unauthenticated',
        cacheHit,
        error ?? undefined,
      ),
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
      isSessionRejected: false,
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
