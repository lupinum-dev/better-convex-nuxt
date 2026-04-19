import type { H3Event } from 'h3'
import {
  defineEventHandler,
  setHeaders,
  setResponseStatus,
  createError,
  getRequestURL,
  send,
  appendResponseHeader,
} from 'h3'

import { DEFAULT_SERVER_FETCH_TIMEOUT_MS } from '../../../../convex/server/http.js'
import { getConvexRuntimeConfig } from '../../../../convex/shared/runtime-config.js'
import type { AuthProxyRequest } from '../../../../devtools/types.js'
import {
  buildAuthProxyUnreachableMessage,
  buildAuthProxyUpstreamStatusMessage,
  buildBlockedOriginMessage,
  buildMissingSiteUrlMessage,
} from '../../../shared/auth-errors.js'
import {
  clearsBetterAuthSessionCookie,
  getBetterAuthSessionToken,
} from '../../../shared/auth-token.js'
import { serverConvexClearAuthCache } from '../../auth-cache.js'
import {
  getRequestBodySizeError,
  getResponseBodySizeError,
  readRequestBodyWithLimit,
  readResponseBodyWithLimit,
} from './body-size.js'
import { buildAuthProxyForwardHeaders, shouldSkipProxyResponseHeader } from './headers.js'
import { fetchWithCanonicalRedirects } from './redirect-utils.js'
import { getAuthRoutePattern, isOriginAllowed } from './security.js'

const GENERIC_CORS_ALLOW_METHODS = 'GET, POST, PUT, DELETE, PATCH, OPTIONS'
const CRITICAL_AUTH_ENDPOINT_ALLOW_METHODS = ['GET', 'OPTIONS'] as const

function getCriticalEndpointAllowMethods(path: string): ReadonlyArray<string> | null {
  if (path === '/convex/token' || path === '/get-session') {
    return CRITICAL_AUTH_ENDPOINT_ALLOW_METHODS
  }

  return null
}

function isMalformedAuthSubpath(path: string): boolean {
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(path)
  } catch {
    return true
  }

  const lowerDecodedPath = decodedPath.toLowerCase()

  if (decodedPath.includes('\\')) {
    return true
  }

  // Reject traversal separators/dot segments that only appear after a second decode pass.
  if (
    lowerDecodedPath.includes('%2e') ||
    lowerDecodedPath.includes('%2f') ||
    lowerDecodedPath.includes('%5c')
  ) {
    return true
  }

  const normalizedPath = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`
  return normalizedPath.split('/').includes('..')
}

async function recordAuthProxyRequestInDev(request: AuthProxyRequest): Promise<void> {
  if (!import.meta.dev) return
  const { recordAuthProxyRequest } = await import('../../../../devtools/auth-proxy-registry.js')
  await recordAuthProxyRequest(request)
}

/**
 * Validates if the given origin is allowed.
 * Same-origin requests are always allowed.
 * Cross-origin requests must match a trustedOrigins pattern.
 * Supports wildcard patterns (e.g., 'https://preview-*.vercel.app').
 */
export default defineEventHandler(async (event: H3Event) => {
  const convexConfig = getConvexRuntimeConfig()
  const siteUrl = convexConfig.siteUrl
  const trustedOrigins = convexConfig.auth.trustedOrigins
  const authRoute = convexConfig.auth.route
  const authProxy = convexConfig.auth.proxy

  // Dev mode: track request timing
  const startTime = import.meta.dev ? Date.now() : 0
  const requestId = import.meta.dev ? crypto.randomUUID() : ''
  const requestUrl = getRequestURL(event)
  const incomingSessionToken = getBetterAuthSessionToken(event.headers.get('cookie') ?? '')

  if (!siteUrl) {
    throw createError({
      statusCode: 500,
      message: buildMissingSiteUrlMessage(convexConfig.url),
      data: { code: 'BCN_AUTH_PROXY_SITE_URL_MISSING' },
    })
  }
  const siteOrigin = new URL(siteUrl)
  const appOrigin = requestUrl.origin
  const upstreamOrigin = siteOrigin.origin

  // Use configured authRoute for path stripping (escape special regex chars)
  const authRoutePattern = getAuthRoutePattern(authRoute)
  const path = requestUrl.pathname.replace(authRoutePattern, '') || '/'
  // Ensure path starts with / to avoid malformed URLs like /api/authtoken
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (isMalformedAuthSubpath(normalizedPath)) {
    setHeaders(event, {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    throw createError({
      statusCode: 404,
      message: 'Not Found',
      data: { code: 'BCN_AUTH_PROXY_INVALID_PATH' },
    })
  }

  const criticalEndpointAllowMethods = getCriticalEndpointAllowMethods(normalizedPath)
  const target = `${siteUrl}/api/auth${normalizedPath}${requestUrl.search}`

  // Handle CORS preflight
  // Security: Only allow CORS for validated origins (same-origin or trustedOrigins)
  if (event.method === 'OPTIONS') {
    const origin = event.headers.get('origin')
    if (!origin || !isOriginAllowed(origin, appOrigin, trustedOrigins)) {
      throw createError({
        statusCode: 403,
        message: buildBlockedOriginMessage(origin, requestUrl.host),
        data: { code: 'BCN_AUTH_PROXY_ORIGIN_BLOCKED', origin },
      })
    }
    setHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods':
        criticalEndpointAllowMethods?.join(', ') ?? GENERIC_CORS_ALLOW_METHODS,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    })
    setResponseStatus(event, 204)
    return null
  }

  // Set CORS headers for the response (only for validated origins)
  const origin = event.headers.get('origin')
  const isAllowedOrigin = origin ? isOriginAllowed(origin, appOrigin, trustedOrigins) : true
  if (origin && isAllowedOrigin) {
    setHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'Set-Cookie',
    })
  }

  // Enforce origin checks for non-preflight requests
  if (origin && !isAllowedOrigin) {
    throw createError({
      statusCode: 403,
      message: buildBlockedOriginMessage(origin, requestUrl.host),
      data: { code: 'BCN_AUTH_PROXY_ORIGIN_BLOCKED', origin },
    })
  }

  if (criticalEndpointAllowMethods && !criticalEndpointAllowMethods.includes(event.method)) {
    setHeaders(event, {
      Allow: criticalEndpointAllowMethods.join(', '),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    throw createError({
      statusCode: 405,
      message: 'Method Not Allowed',
      data: { code: 'BCN_AUTH_PROXY_METHOD_NOT_ALLOWED' },
    })
  }

  try {
    const forwardHeaders = buildAuthProxyForwardHeaders(event, {
      canonicalOrigin: siteOrigin,
    })

    // Get request body for POST/PUT/PATCH
    let body: string | undefined
    if (['POST', 'PUT', 'PATCH'].includes(event.method)) {
      const requestBodySizeError = getRequestBodySizeError(
        event.headers.get('content-length'),
        authProxy.maxRequestBodyBytes,
      )
      if (requestBodySizeError) {
        throw createError({
          statusCode: requestBodySizeError.statusCode,
          message: requestBodySizeError.message,
          data: {
            code: requestBodySizeError.code,
            contentLengthBytes: requestBodySizeError.contentLengthBytes,
            maxBytes: requestBodySizeError.maxBytes,
          },
        })
      }
      body = await readRequestBodyWithLimit(event, authProxy.maxRequestBodyBytes)
    }

    // Make request to Convex (manual redirect handling).
    // We internally follow only canonical host redirects (same path/query),
    // but preserve intentional redirects to providers (OAuth, etc).
    const response = await fetchWithCanonicalRedirects({
      target,
      allowedOrigin: upstreamOrigin,
      method: event.method,
      headers: forwardHeaders,
      body,
      timeoutMs: DEFAULT_SERVER_FETCH_TIMEOUT_MS,
    })

    // Add security headers to all non-redirect responses
    setHeaders(event, {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })

    // Common misconfig path: Convex site URL reachable, but Better Auth routes are missing.
    const isCriticalAuthEndpoint =
      normalizedPath === '/convex/token' || normalizedPath === '/get-session'
    const redirectLocation = response.headers.get('location')
    if (isCriticalAuthEndpoint && (response.status === 404 || response.status >= 500)) {
      throw createError({
        statusCode: 502,
        message: buildAuthProxyUpstreamStatusMessage(siteUrl, normalizedPath, response.status),
        data: {
          code: 'BCN_AUTH_PROXY_UPSTREAM_STATUS',
          upstreamStatus: response.status,
          path: normalizedPath,
        },
      })
    }
    if (isCriticalAuthEndpoint && response.status >= 300 && response.status < 400) {
      let redirectOrigin: string | null = null
      try {
        redirectOrigin = redirectLocation ? new URL(redirectLocation, target).origin : null
      } catch {
        redirectOrigin = null
      }

      if (!redirectOrigin || redirectOrigin !== upstreamOrigin) {
        throw createError({
          statusCode: 502,
          message: buildAuthProxyUpstreamStatusMessage(siteUrl, normalizedPath, response.status),
          data: {
            code: 'BCN_AUTH_PROXY_UPSTREAM_STATUS',
            upstreamStatus: response.status,
            path: normalizedPath,
          },
        })
      }
    }

    const cookies = response.headers.getSetCookie?.() || []
    const shouldClearSessionCache =
      Boolean(incomingSessionToken) &&
      response.status >= 200 &&
      response.status < 400 &&
      clearsBetterAuthSessionCookie(cookies)

    if (shouldClearSessionCache && incomingSessionToken) {
      try {
        await serverConvexClearAuthCache(incomingSessionToken)
      } catch (error) {
        console.warn('[auth-proxy] Failed to clear cached auth state after upstream logout:', error)
      }
    }

    // Dev mode: log the request
    if (import.meta.dev) {
      await recordAuthProxyRequestInDev({
        id: requestId,
        path,
        method: event.method,
        timestamp: startTime,
        status: response.status,
        duration: Date.now() - startTime,
        success: response.ok,
      })
    }

    // Preserve intentional redirects (OAuth flows, etc).
    if (response.status >= 300 && response.status < 400) {
      setResponseStatus(event, response.status, response.statusText)
      for (const cookie of cookies) {
        appendResponseHeader(event, 'set-cookie', cookie)
      }
      for (const [key, value] of response.headers.entries()) {
        if (!shouldSkipProxyResponseHeader(key)) {
          setHeaders(event, { [key]: value })
        }
      }
      return ''
    }

    // Forward response body
    const responseBodySizeError = getResponseBodySizeError(
      response.headers.get('content-length'),
      authProxy.maxResponseBodyBytes,
    )
    if (responseBodySizeError) {
      throw createError({
        statusCode: responseBodySizeError.statusCode,
        message: responseBodySizeError.message,
        data: {
          code: responseBodySizeError.code,
          contentLengthBytes: responseBodySizeError.contentLengthBytes,
          maxBytes: responseBodySizeError.maxBytes,
        },
      })
    }
    const responseBody = await readResponseBodyWithLimit(response, authProxy.maxResponseBodyBytes)

    // Forward response status
    setResponseStatus(event, response.status, response.statusText)

    // Forward response headers (except some that shouldn't be forwarded)
    // Handle Set-Cookie specially (can have multiple values)
    for (const cookie of cookies) {
      appendResponseHeader(event, 'set-cookie', cookie)
    }

    // Forward other headers
    for (const [key, value] of response.headers.entries()) {
      if (!shouldSkipProxyResponseHeader(key)) {
        setHeaders(event, { [key]: value })
      }
    }
    return send(event, responseBody)
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    // Dev mode: log the failed request
    if (import.meta.dev) {
      await recordAuthProxyRequestInDev({
        id: requestId,
        path,
        method: event.method,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    // Security: Don't leak internal error details in production
    if (import.meta.dev) {
      console.error(buildAuthProxyUnreachableMessage(siteUrl, error))
    }
    throw createError({
      statusCode: 502,
      message: 'Failed to proxy request to Convex auth server',
      data: { code: 'BCN_AUTH_PROXY_UNREACHABLE' },
    })
  }
})
