import type { H3Event } from 'h3'
import {
  defineEventHandler,
  proxyRequest,
  setHeaders,
  setResponseStatus,
  createError,
  getRequestURL,
} from 'h3'
import { useRuntimeConfig } from '#imports'

export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig()
  const siteUrl = config.public.convex?.siteUrl || config.public.convex?.auth?.url

  if (!siteUrl) {
    throw createError({
      statusCode: 500,
      message: 'Convex site URL not configured',
    })
  }

  // Get the full URL with path and query
  const requestUrl = getRequestURL(event)
  const path = requestUrl.pathname.replace(/^\/api\/auth/, '') || '/'
  const target = `${siteUrl}/api/auth${path}${requestUrl.search}`

  // Handle CORS preflight
  // Security: Only allow CORS for browser requests (with origin header)
  if (event.method === 'OPTIONS') {
    const origin = event.headers.get('origin')
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

  // Set CORS headers for the response
  const origin = event.headers.get('origin')
  if (origin) {
    setHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'Set-Cookie',
    })
  }

  try {
    // Use H3's proxyRequest for the actual proxying
    // proxyRequest handles: method, headers, body, and response forwarding
    return await proxyRequest(event, target, {
      // Don't send host header (would cause issues with the target server)
      headers: {
        host: undefined,
      },
      fetchOptions: {
        credentials: 'include',
      },
    })
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
