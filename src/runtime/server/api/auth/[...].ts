import {
  defineEventHandler,
  readBody,
  getQuery,
  getMethod,
  setHeaders,
  setResponseStatus,
  createError,
  useRuntimeConfig,
} from '#imports'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const siteUrl = config.public.convex?.siteUrl || config.public.convex?.auth?.url

  if (!siteUrl) {
    throw createError({
      statusCode: 500,
      message: 'Convex site URL not configured',
    })
  }

  // Get the path after /api/auth
  const path = event.path.replace(/^\/api\/auth/, '') || '/'
  const targetUrl = `${siteUrl}/api/auth${path}`

  // Get method and query params
  const method = getMethod(event)
  const query = getQuery(event)
  const queryString = new URLSearchParams(query as Record<string, string>).toString()
  const finalUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    const origin = event.headers.get('origin')
    // Security: Only allow CORS for browser requests (with origin header)
    // Server-to-server requests should not use CORS
    if (!origin) {
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

  // Prepare headers
  const headers: Record<string, string> = {}

  // Only set Content-Type for requests with body
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = event.headers.get('content-type') || 'application/json'
  }

  // Forward client Origin header - Better Auth validates against trustedOrigins
  // Security: Only forward origin if present (don't spoof it)
  // Server-to-server requests (no origin) should not set Origin header
  const clientOrigin = event.headers.get('origin')
  if (clientOrigin) {
    headers.Origin = clientOrigin
  }
  // Note: We intentionally don't set Origin header when missing
  // Better Auth will handle server-to-server requests appropriately

  // Forward cookies
  const cookies = event.headers.get('cookie')
  if (cookies) {
    headers.Cookie = cookies
  }

  // Forward authorization header if present
  const authHeader = event.headers.get('authorization')
  if (authHeader) {
    headers.Authorization = authHeader
  }

  // Read request body for non-GET requests
  let body: unknown = undefined
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = await readBody(event)
    } catch {
      // Body might be empty or already read
    }
  }

  try {
    // Make request to Convex
    const response = await fetch(finalUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    // Get response body
    const responseText = await response.text()
    let responseData: unknown
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = responseText
    }

    // Set CORS headers
    // Security: Only set CORS headers for browser requests (with origin)
    // Server-to-server responses don't need CORS
    const responseOrigin = event.headers.get('origin')
    if (responseOrigin) {
      setHeaders(event, {
        'Access-Control-Allow-Origin': responseOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Expose-Headers': 'Set-Cookie',
      })
    }

    // Forward Set-Cookie headers from Convex response
    // Collect all Set-Cookie headers individually (Fetch API returns comma-joined string for multiple)
    const allSetCookieHeaders: string[] = []
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === 'set-cookie') {
        allSetCookieHeaders.push(value)
      }
    }

    // Forward each Set-Cookie header individually using raw Node.js response
    // This prevents H3 from modifying cookie attributes (path, SameSite, etc.)
    // H3's setHeaders() doesn't handle comma-joined Set-Cookie strings properly
    for (const cookieHeader of allSetCookieHeaders) {
      event.node.res.appendHeader('Set-Cookie', cookieHeader)
    }

    // Return response with same status
    setResponseStatus(event, response.status)
    return responseData
  } catch (error) {
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
