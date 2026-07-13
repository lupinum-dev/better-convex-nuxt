import type { H3Event } from 'h3'
import {
  appendResponseHeader,
  createError,
  defineEventHandler,
  getRequestURL,
  getRequestWebStream,
  send,
  setHeaders,
  setResponseStatus,
} from 'h3'

import type { AuthProxyRequest } from '../../../devtools/types'
import {
  buildAuthProxyUnreachableMessage,
  buildAuthProxyUpstreamStatusMessage,
  buildBlockedOriginMessage,
  buildMissingSiteUrlMessage,
} from '../../../utils/auth-errors'
import { getConvexRuntimeConfig } from '../../../utils/runtime-config'
import { normalizeConvexSiteUrl } from '../../../utils/site-url'
import { DEFAULT_SERVER_FETCH_TIMEOUT_MS } from '../../utils/http'
import {
  getRequestBodySizeError,
  getResponseBodySizeError,
  readRequestBodyWithLimit,
  readResponseBodyWithLimit,
} from './body-size'
import { buildAuthProxyForwardHeaders, shouldSkipProxyResponseHeader } from './headers'
import { isSameOrigin } from './security'

const AUTH_ROUTE = '/api/auth'
const ALLOWED_METHODS = new Set(['GET', 'POST'])

async function recordAuthProxyRequestInDev(request: AuthProxyRequest): Promise<void> {
  if (!import.meta.dev) return
  const { recordAuthProxyRequest } = await import('../../../devtools/auth-proxy-registry')
  await recordAuthProxyRequest(request)
}

export default defineEventHandler(async (event: H3Event) => {
  const startedAt = Date.now()
  const requestId = import.meta.dev ? crypto.randomUUID() : ''
  const requestUrl = getRequestURL(event)
  const config = getConvexRuntimeConfig()
  const auth = config.auth

  if (auth === false) {
    throw createError({ statusCode: 404, message: 'Authentication is disabled' })
  }
  if (!ALLOWED_METHODS.has(event.method)) {
    throw createError({ statusCode: 405, message: 'Auth proxy permits only GET and POST' })
  }

  const origin = event.headers.get('origin')
  if (origin && !isSameOrigin(origin, requestUrl.origin)) {
    throw createError({
      statusCode: 403,
      message: buildBlockedOriginMessage(origin, requestUrl.host),
      data: { code: 'BCN_AUTH_PROXY_ORIGIN_BLOCKED' },
    })
  }

  if (!config.siteUrl) {
    throw createError({
      statusCode: 500,
      message: buildMissingSiteUrlMessage(config.url),
      data: { code: 'BCN_AUTH_PROXY_SITE_URL_MISSING' },
    })
  }

  const siteUrl = normalizeConvexSiteUrl(config.siteUrl)
  const path = requestUrl.pathname.startsWith(AUTH_ROUTE)
    ? requestUrl.pathname.slice(AUTH_ROUTE.length) || '/'
    : '/'
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const target = `${siteUrl}${AUTH_ROUTE}${normalizedPath}${requestUrl.search}`
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error('Auth proxy deadline exceeded')),
    DEFAULT_SERVER_FETCH_TIMEOUT_MS,
  )

  try {
    const forwardHeaders = buildAuthProxyForwardHeaders(event, {
      requestUrl,
      trustedClientIpHeader: auth.proxy.trustedClientIpHeader,
    })
    let body: Uint8Array | undefined
    if (event.method === 'POST') {
      const sizeError = getRequestBodySizeError(
        event.headers.get('content-length'),
        auth.proxy.maxRequestBodyBytes,
      )
      if (sizeError)
        throw createError({ statusCode: 413, message: sizeError.message, data: sizeError })
      body = await readRequestBodyWithLimit(
        getRequestWebStream(event),
        auth.proxy.maxRequestBodyBytes,
        controller.signal,
      )
    }

    const response = await fetch(target, {
      method: event.method,
      headers: forwardHeaders,
      body: body
        ? (body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer)
        : undefined,
      redirect: 'manual',
      signal: controller.signal,
    })

    const critical = normalizedPath === '/convex/token' || normalizedPath === '/get-session'
    if (critical && (response.status === 404 || response.status >= 500)) {
      throw createError({
        statusCode: 502,
        message: buildAuthProxyUpstreamStatusMessage(siteUrl, normalizedPath, response.status),
        data: { code: 'BCN_AUTH_PROXY_UPSTREAM_STATUS', upstreamStatus: response.status },
      })
    }

    const responseSizeError = getResponseBodySizeError(
      response.headers.get('content-length'),
      auth.proxy.maxResponseBodyBytes,
    )
    if (responseSizeError) {
      throw createError({
        statusCode: 502,
        message: responseSizeError.message,
        data: responseSizeError,
      })
    }
    const responseBody = await readResponseBodyWithLimit(
      response,
      auth.proxy.maxResponseBodyBytes,
      controller.signal,
    )

    setResponseStatus(event, response.status, response.statusText)
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      appendResponseHeader(event, 'set-cookie', cookie)
    }
    for (const [key, value] of response.headers.entries()) {
      if (!shouldSkipProxyResponseHeader(key)) setHeaders(event, { [key]: value })
    }
    setHeaders(event, { 'cache-control': 'private, no-store' })

    await recordAuthProxyRequestInDev({
      id: requestId,
      path: normalizedPath,
      method: event.method,
      timestamp: startedAt,
      status: response.status,
      duration: Date.now() - startedAt,
      success: response.ok,
    })
    return send(event, responseBody)
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    await recordAuthProxyRequestInDev({
      id: requestId,
      path: normalizedPath,
      method: event.method,
      timestamp: startedAt,
      duration: Date.now() - startedAt,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw createError({
      statusCode: 502,
      message: import.meta.dev
        ? buildAuthProxyUnreachableMessage(siteUrl, error)
        : 'Failed to proxy request to Convex auth server',
      data: { code: 'BCN_AUTH_PROXY_UNREACHABLE' },
    })
  } finally {
    clearTimeout(timeout)
  }
})
