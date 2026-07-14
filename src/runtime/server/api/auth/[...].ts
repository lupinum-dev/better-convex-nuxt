import type { H3Event } from 'h3'
import {
  appendResponseHeader,
  createError,
  defineEventHandler,
  getRequestURL,
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
import { hasSetCookieDomainAttribute, isBetterAuthSetCookie } from '../../../utils/shared-helpers'
import { normalizeConvexSiteUrl } from '../../../utils/site-url'
import { DEFAULT_SERVER_FETCH_TIMEOUT_MS } from '../../utils/http'
import {
  cancelResponseBody,
  getRequestBodySizeError,
  getResponseBodySizeError,
  readRequestBodyWithLimit,
  readResponseBodyWithLimit,
} from './body-size'
import {
  buildAuthProxyForwardHeaders,
  isSupportedProxyResponseContentEncoding,
  shouldSkipProxyResponseHeader,
} from './headers'
import { isCrossOriginAuthRequest } from './security'

const AUTH_ROUTE = '/api/auth'
const ALLOWED_METHODS = new Set(['GET', 'POST'])

function toError(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(fallback)
}

function closeRequestConnection(event: H3Event): void {
  if (event.node.res.headersSent) return
  event.node.res.shouldKeepAlive = false
  setHeaders(event, { connection: 'close' })
}

function hasFramedGetBody(headers: Headers): boolean {
  if (headers.has('transfer-encoding')) return true
  const contentLength = headers.get('content-length')
  if (contentLength === null) return false
  try {
    return BigInt(contentLength.trim()) !== 0n
  } catch {
    return true
  }
}

function hasUnsupportedRequestContentEncoding(headers: Headers): boolean {
  const value = headers.get('content-encoding')
  return value !== null && value.trim().toLowerCase() !== 'identity'
}

function createAuthProxyLifecycle(event: H3Event, startedAt: number) {
  const controller = new AbortController()
  const abort = (reason: Error) => {
    if (!controller.signal.aborted) controller.abort(reason)
  }
  const onRequestAborted = () => abort(new Error('Auth proxy client disconnected'))
  const onRequestClose = () => {
    if (!event.node.req.complete) onRequestAborted()
  }
  const onRequestError = (error: Error) => abort(error)
  const onResponseClose = () => {
    if (!event.node.res.writableFinished) onRequestAborted()
  }
  const onWebAbort = () =>
    abort(toError(event.web?.request?.signal.reason, 'Auth proxy client disconnected'))

  event.node.req.once('aborted', onRequestAborted)
  event.node.req.once('close', onRequestClose)
  event.node.req.once('error', onRequestError)
  event.node.res.once('close', onResponseClose)
  event.web?.request?.signal.addEventListener('abort', onWebAbort, { once: true })

  const remainingMs = Math.max(0, DEFAULT_SERVER_FETCH_TIMEOUT_MS - (Date.now() - startedAt))
  const timeout = setTimeout(() => abort(new Error('Auth proxy deadline exceeded')), remainingMs)
  timeout.unref?.()

  return {
    controller,
    cleanup() {
      clearTimeout(timeout)
      event.node.req.off('aborted', onRequestAborted)
      event.node.req.off('close', onRequestClose)
      event.node.req.off('error', onRequestError)
      event.node.res.off('close', onResponseClose)
      event.web?.request?.signal.removeEventListener('abort', onWebAbort)
    },
  }
}

async function sendAuthProxyBody(
  event: H3Event,
  body: Uint8Array,
  signal: AbortSignal,
): Promise<void> {
  if (!event.node.res.socket) {
    await send(event, body)
    return
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      event.node.res.off('finish', onFinish)
      event.node.res.off('close', onClose)
      event.node.res.off('error', onError)
    }
    const succeed = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(toError(error, 'Auth proxy response failed'))
    }
    const onFinish = () => succeed()
    const onClose = () => {
      if (event.node.res.writableFinished) succeed()
      else fail(new Error('Auth proxy client disconnected during download'))
    }
    const onError = (error: Error) => fail(error)
    const onAbort = () => {
      const error = toError(signal.reason, 'Auth proxy response was aborted')
      fail(error)
      event.node.res.destroy(error)
    }

    event.node.res.once('finish', onFinish)
    event.node.res.once('close', onClose)
    event.node.res.once('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })

    if (signal.aborted) {
      onAbort()
      return
    }
    try {
      event.node.res.end(body)
    } catch (error) {
      fail(error)
    }
  })
}

async function recordAuthProxyRequestInDev(request: AuthProxyRequest): Promise<void> {
  if (!import.meta.dev) return
  const { recordAuthProxyRequest } = await import('../../../devtools/auth-proxy-registry')
  await recordAuthProxyRequest(request)
}

export default defineEventHandler(async (event: H3Event) => {
  setHeaders(event, { 'cache-control': 'private, no-store' })
  const startedAt = Date.now()
  const requestId = import.meta.dev ? crypto.randomUUID() : ''
  const requestUrl = getRequestURL(event)
  const config = getConvexRuntimeConfig()
  const auth = config.auth

  if (auth === false) {
    if (event.method !== 'GET' || !event.node.req.complete) closeRequestConnection(event)
    throw createError({ statusCode: 404, message: 'Authentication is disabled' })
  }
  if (!ALLOWED_METHODS.has(event.method)) {
    closeRequestConnection(event)
    throw createError({ statusCode: 405, message: 'Auth proxy permits only GET and POST' })
  }
  if (event.method === 'GET' && hasFramedGetBody(event.headers)) {
    closeRequestConnection(event)
    throw createError({
      statusCode: 400,
      message: 'Auth proxy GET requests must not contain a body',
      data: { code: 'BCN_AUTH_PROXY_GET_BODY_REJECTED' },
    })
  }

  const path = requestUrl.pathname.startsWith(AUTH_ROUTE)
    ? requestUrl.pathname.slice(AUTH_ROUTE.length) || '/'
    : '/'
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const origin = event.headers.get('origin')
  if (isCrossOriginAuthRequest(event.headers, event.method, requestUrl.origin, normalizedPath)) {
    if (event.method === 'POST') closeRequestConnection(event)
    throw createError({
      statusCode: 403,
      message: buildBlockedOriginMessage(origin, requestUrl.host),
      data: { code: 'BCN_AUTH_PROXY_ORIGIN_BLOCKED' },
    })
  }
  if (event.method === 'POST' && hasUnsupportedRequestContentEncoding(event.headers)) {
    closeRequestConnection(event)
    throw createError({
      statusCode: 415,
      message: 'Auth proxy accepts only identity-encoded request bodies',
      data: { code: 'BCN_AUTH_PROXY_REQUEST_ENCODING_UNSUPPORTED' },
    })
  }

  if (!config.siteUrl) {
    if (event.method === 'POST') closeRequestConnection(event)
    throw createError({
      statusCode: 500,
      message: buildMissingSiteUrlMessage(config.url),
      data: { code: 'BCN_AUTH_PROXY_SITE_URL_MISSING' },
    })
  }

  const siteUrl = normalizeConvexSiteUrl(config.siteUrl)
  const target = `${siteUrl}${AUTH_ROUTE}${normalizedPath}${requestUrl.search}`
  const lifecycle = createAuthProxyLifecycle(event, startedAt)
  const { controller } = lifecycle
  let response: Response | undefined

  try {
    const forwardHeaders = buildAuthProxyForwardHeaders(event, {
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
        event,
        auth.proxy.maxRequestBodyBytes,
        controller.signal,
      )
    }

    response = await fetch(target, {
      method: event.method,
      headers: forwardHeaders,
      body: body
        ? (body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer)
        : undefined,
      redirect: 'manual',
      signal: controller.signal,
    })

    const responseCookies = response.headers.getSetCookie?.() ?? []
    for (const cookie of responseCookies) {
      if (!isBetterAuthSetCookie(cookie)) {
        throw createError({
          statusCode: 502,
          message: 'Auth proxy upstream returned a cookie outside the supported namespace',
          data: { code: 'BCN_AUTH_PROXY_COOKIE_NAME_UNSUPPORTED' },
        })
      }
      if (hasSetCookieDomainAttribute(cookie)) {
        throw createError({
          statusCode: 502,
          message: 'Auth proxy does not support Domain-scoped Better Auth cookies',
          data: { code: 'BCN_AUTH_PROXY_COOKIE_DOMAIN_UNSUPPORTED' },
        })
      }
    }

    if (!isSupportedProxyResponseContentEncoding(response.headers.get('content-encoding'))) {
      throw createError({
        statusCode: 502,
        message: 'Auth proxy upstream returned an unsupported content encoding',
        data: { code: 'BCN_AUTH_PROXY_UPSTREAM_ENCODING_UNSUPPORTED' },
      })
    }

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
    for (const cookie of responseCookies) {
      appendResponseHeader(event, 'set-cookie', cookie)
    }
    const responseConnection = response.headers.get('connection')
    for (const [key, value] of response.headers.entries()) {
      if (!shouldSkipProxyResponseHeader(key, responseConnection)) {
        setHeaders(event, { [key]: value })
      }
    }
    await recordAuthProxyRequestInDev({
      id: requestId,
      path: normalizedPath,
      method: event.method,
      timestamp: startedAt,
      status: response.status,
      duration: Date.now() - startedAt,
      success: response.ok,
    })
    await sendAuthProxyBody(event, responseBody, controller.signal)
  } catch (error) {
    cancelResponseBody(response, error)
    if (
      event.method === 'POST' &&
      (!event.node.req.complete ||
        (error &&
          typeof error === 'object' &&
          'statusCode' in error &&
          error.statusCode === 413)) &&
      !event.node.res.headersSent
    ) {
      closeRequestConnection(event)
    }
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw createError(error as Error & { statusCode: number; data?: unknown })
    }
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
    lifecycle.cleanup()
  }
})
