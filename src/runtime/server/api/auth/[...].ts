import type { H3Event } from 'h3'
import {
  defineEventHandler,
  setHeaders,
  setResponseStatus,
  createError,
  getRequestURL,
  readRawBody,
  send,
} from 'h3'
import type { AuthProxyRequest } from '../../../devtools/types'
import { fetchWithCanonicalRedirects } from './redirect-utils'
import { getRequestBodySizeError, getResponseBodySizeError } from './body-size'
import { DEFAULT_SERVER_FETCH_TIMEOUT_MS } from '../../utils/http'
import { getAuthRoutePattern, isOriginAllowed } from './security'
import { buildAuthProxyForwardHeaders, shouldSkipProxyResponseHeader } from './headers'
import {
  buildAuthProxyUnreachableMessage,
  buildAuthProxyUpstreamStatusMessage,
  buildBlockedOriginMessage,
  buildMissingSiteUrlMessage,
} from '../../../utils/auth-errors'
import { getConvexRuntimeConfig } from '../../../utils/runtime-config'

async function recordAuthProxyRequestInDev(request: AuthProxyRequest): Promise<void> {
  if (!import.meta.dev) return
  const { recordAuthProxyRequest } = await import('../../../devtools/auth-proxy-registry')
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
  const trustedOrigins = convexConfig.trustedOrigins
  const authRoute = convexConfig.authRoute

  // Dev mode: track request timing
  const startTime = import.meta.dev ? Date.now() : 0
  const requestId = import.meta.dev ? crypto.randomUUID() : ''
  const requestUrl = getRequestURL(event)

  if (!siteUrl) {
      throw createError({
        statusCode: 500,
        message: buildMissingSiteUrlMessage(convexConfig.url),
        data: { code: 'BCN_AUTH_PROXY_SITE_URL_MISSING' },
      })
    }

  // Use configured authRoute for path stripping (escape special regex chars)
  const authRoutePattern = getAuthRoutePattern(authRoute)
  const path = requestUrl.pathname.replace(authRoutePattern, '') || '/'
  // Ensure path starts with / to avoid malformed URLs like /api/authtoken
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const target = `${siteUrl}/api/auth${normalizedPath}${requestUrl.search}`

  // Handle CORS preflight
  // Security: Only allow CORS for validated origins (same-origin or trustedOrigins)
  if (event.method === 'OPTIONS') {
    const origin = event.headers.get('origin')
    if (!origin || !isOriginAllowed(origin, requestUrl.origin, trustedOrigins)) {
      throw createError({
        statusCode: 403,
        message: buildBlockedOriginMessage(origin, requestUrl.host),
        data: { code: 'BCN_AUTH_PROXY_ORIGIN_BLOCKED', origin },
      })
    }
    setHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    })
    setResponseStatus(event, 204)
    return null
  }

  // Set CORS headers for the response (only for validated origins)
  const origin = event.headers.get('origin')
  const isAllowedOrigin = origin ? isOriginAllowed(origin, requestUrl.origin, trustedOrigins) : true
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

  try {
    const forwardHeaders = buildAuthProxyForwardHeaders(event, {
      requestUrl,
      originalHost: event.headers.get('host'),
    })

    // Get request body for POST/PUT/PATCH
    let body: string | undefined
    if (['POST', 'PUT', 'PATCH'].includes(event.method)) {
      const requestBodySizeError = getRequestBodySizeError(event.headers.get('content-length'))
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
      body = (await readRawBody(event, 'utf8')) || undefined
    }

    // Make request to Convex (manual redirect handling).
    // We internally follow only canonical host redirects (same path/query),
    // but preserve intentional redirects to providers (OAuth, etc).
    const response = await fetchWithCanonicalRedirects({
      target,
      method: event.method,
      headers: forwardHeaders,
      body,
      timeoutMs: DEFAULT_SERVER_FETCH_TIMEOUT_MS,
    })

    // Common misconfig path: Convex site URL reachable, but Better Auth routes are missing.
    const isCriticalAuthEndpoint = normalizedPath === '/convex/token' || normalizedPath === '/get-session'
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

    // Forward response status
    setResponseStatus(event, response.status, response.statusText)

    // Forward response headers (except some that shouldn't be forwarded)
    // Handle Set-Cookie specially (can have multiple values)
    const cookies = response.headers.getSetCookie?.() || []
    for (const cookie of cookies) {
      event.node.res.appendHeader('set-cookie', cookie)
    }

    // Forward other headers
    for (const [key, value] of response.headers.entries()) {
      if (!shouldSkipProxyResponseHeader(key)) {
        setHeaders(event, { [key]: value })
      }
    }

    // Preserve intentional redirects (OAuth flows, etc).
    if (response.status >= 300 && response.status < 400) {
      return ''
    }

    // Forward response body
    const responseBodySizeError = getResponseBodySizeError(response.headers.get('content-length'))
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
    const responseBody = Buffer.from(await response.arrayBuffer())
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
    const errorMessage = import.meta.dev
      ? buildAuthProxyUnreachableMessage(siteUrl, error)
      : 'Failed to proxy request to Convex auth server'
    throw createError({
      statusCode: 502,
      message: errorMessage,
      data: { code: 'BCN_AUTH_PROXY_UNREACHABLE' },
    })
  }
})
