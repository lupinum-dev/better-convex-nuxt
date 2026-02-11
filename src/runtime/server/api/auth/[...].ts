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
import { useRuntimeConfig } from '#imports'
import { recordAuthProxyRequest } from '../../../devtools/auth-proxy-registry'

/**
 * Validates if the given origin is allowed.
 * Same-origin requests are always allowed.
 * Cross-origin requests must match a trustedOrigins pattern.
 * Supports wildcard patterns (e.g., 'https://preview-*.vercel.app').
 */
function isOriginAllowed(
  origin: string,
  requestHost: string,
  trustedOrigins: string[],
): boolean {
  // Same-origin requests are always allowed
  // Compare origin (e.g., 'https://example.com') with request host
  try {
    const originUrl = new URL(origin)
    // Request host might not have protocol, so compare just the host part
    if (originUrl.host === requestHost) return true
  } catch {
    // Invalid origin URL
  }

  // Check against trustedOrigins (exact match or wildcard pattern)
  for (const trusted of trustedOrigins) {
    if (trusted.includes('*')) {
      // Convert wildcard pattern to regex
      const pattern = trusted
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except *
        .replace(/\*/g, '.*') // Convert * to .*
      if (new RegExp(`^${pattern}$`).test(origin)) return true
    } else if (origin === trusted) {
      return true
    }
  }

  return false
}

export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig()
  const convexConfig = config.public.convex as
    | { siteUrl?: string; trustedOrigins?: string[]; authRoute?: string }
    | undefined
  const siteUrl = convexConfig?.siteUrl
  const trustedOrigins = convexConfig?.trustedOrigins ?? []
  // Normalize authRoute: ensure leading slash, remove trailing slash
  const rawAuthRoute = convexConfig?.authRoute || '/api/auth'
  const authRoute = (rawAuthRoute.startsWith('/') ? rawAuthRoute : `/${rawAuthRoute}`)
    .replace(/\/+$/, '')

  // Dev mode: track request timing
  const startTime = import.meta.dev ? Date.now() : 0
  const requestId = import.meta.dev ? crypto.randomUUID() : ''
  const requestUrl = getRequestURL(event)

  if (!siteUrl) {
    throw createError({
      statusCode: 500,
      message: 'Convex site URL not configured',
    })
  }

  // Use configured authRoute for path stripping (escape special regex chars)
  const authRoutePattern = new RegExp(`^${authRoute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  const path = requestUrl.pathname.replace(authRoutePattern, '') || '/'
  // Ensure path starts with / to avoid malformed URLs like /api/authtoken
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const target = `${siteUrl}/api/auth${normalizedPath}${requestUrl.search}`

  // Handle CORS preflight
  // Security: Only allow CORS for validated origins (same-origin or trustedOrigins)
  if (event.method === 'OPTIONS') {
    const origin = event.headers.get('origin')
    if (!origin || !isOriginAllowed(origin, requestUrl.host, trustedOrigins)) {
      setResponseStatus(event, 403)
      return null
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
  const isAllowedOrigin = origin ? isOriginAllowed(origin, requestUrl.host, trustedOrigins) : true
  if (origin && isAllowedOrigin) {
    setHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'Set-Cookie',
    })
  }

  // Enforce origin checks for non-preflight requests
  if (origin && !isAllowedOrigin) {
    setResponseStatus(event, 403)
    return null
  }

  try {
    // Get the original request URL for forwarding headers
    const originalHost = event.headers.get('host') || requestUrl.host
    const originalProto = requestUrl.protocol.replace(':', '') // 'http' or 'https'

    // Build headers to forward
    const forwardHeaders: Record<string, string> = {
      'x-forwarded-host': originalHost,
      'x-forwarded-proto': originalProto,
    }

    // Forward specific headers from original request
    const headersToForward = ['cookie', 'content-type', 'accept', 'user-agent', 'origin', 'referer']
    for (const header of headersToForward) {
      const value = event.headers.get(header)
      if (value) {
        forwardHeaders[header] = value
      }
    }

    // Get request body for POST/PUT/PATCH
    let body: string | undefined
    if (['POST', 'PUT', 'PATCH'].includes(event.method)) {
      body = await readRawBody(event, 'utf8') || undefined
    }

    // Make the request to Convex
    const response = await fetch(target, {
      method: event.method,
      headers: forwardHeaders,
      body,
      redirect: 'manual', // Don't follow redirects - let browser handle them
    })

    // Dev mode: log the request
    if (import.meta.dev) {
      recordAuthProxyRequest({
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
    const skipHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']

    // Handle Set-Cookie specially (can have multiple values)
    const cookies = response.headers.getSetCookie?.() || []
    for (const cookie of cookies) {
      event.node.res.appendHeader('set-cookie', cookie)
    }

    // Forward other headers
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase()
      if (lowerKey !== 'set-cookie' && !skipHeaders.includes(lowerKey)) {
        setHeaders(event, { [key]: value })
      }
    }

    // For redirect responses, don't send body - just let the headers do the work
    if (response.status >= 300 && response.status < 400) {
      return ''
    }

    // Forward response body
    const responseBody = await response.text()
    return send(event, responseBody)
  } catch (error) {
    // Dev mode: log the failed request
    if (import.meta.dev) {
      recordAuthProxyRequest({
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
      ? `Failed to proxy request to Convex: ${error instanceof Error ? error.message : String(error)}`
      : 'Failed to proxy request to Convex'
    throw createError({
      statusCode: 502,
      message: errorMessage,
    })
  }
})
