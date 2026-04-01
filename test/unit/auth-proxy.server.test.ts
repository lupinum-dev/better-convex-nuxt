import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES,
  DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES,
  getRequestBodySizeError,
  getResponseBodySizeError,
  readRequestBodyWithLimit,
  readResponseBodyWithLimit,
} from '../../src/runtime/server/api/auth/body-size'
import {
  buildAuthProxyForwardHeaders,
  shouldSkipProxyResponseHeader,
} from '../../src/runtime/server/api/auth/headers'
import {
  fetchWithCanonicalRedirects,
  getCanonicalRedirectTarget,
  normalizePathname,
} from '../../src/runtime/server/api/auth/redirect-utils'
import { getAuthRoutePattern, isOriginAllowed } from '../../src/runtime/server/api/auth/security'

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe('auth proxy body size guards', () => {
  it('ignores missing and malformed content-length headers', () => {
    expect(getRequestBodySizeError(null)).toBeNull()
    expect(getRequestBodySizeError('not-a-number')).toBeNull()
    expect(getResponseBodySizeError(null)).toBeNull()
    expect(getResponseBodySizeError('not-a-number')).toBeNull()
  })

  it('rejects oversized request bodies with 413', () => {
    const error = getRequestBodySizeError(String(DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES + 1))
    expect(error?.statusCode).toBe(413)
    expect(error?.code).toBe('BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE')
  })

  it('rejects oversized upstream responses with 502', () => {
    const error = getResponseBodySizeError(String(DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES + 1))
    expect(error?.statusCode).toBe(502)
    expect(error?.code).toBe('BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE')
  })

  it('accepts payloads exactly at the configured limits', () => {
    expect(getRequestBodySizeError(String(DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES))).toBeNull()
    expect(getResponseBodySizeError(String(DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES))).toBeNull()
  })

  it('supports custom configured limits', () => {
    expect(getRequestBodySizeError('11', 10)?.maxBytes).toBe(10)
    expect(getResponseBodySizeError('11', 10)?.maxBytes).toBe(10)
  })

  it('reads request bodies incrementally and rejects chunked overflows', async () => {
    const makeEvent = () =>
      ({
        method: 'POST',
        web: {
          request: {
            body: makeStream(['hello', 'world']),
          },
        },
      }) as never

    await expect(readRequestBodyWithLimit(makeEvent(), 16)).resolves.toBe('helloworld')

    await expect(readRequestBodyWithLimit(makeEvent(), 5)).rejects.toMatchObject({
      statusCode: 413,
      code: 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE',
    })
  })

  it('reads response bodies incrementally and rejects oversized upstream payloads', async () => {
    const response = new Response(makeStream(['hello', 'world']))

    const body = await readResponseBodyWithLimit(response, 16)
    expect(new TextDecoder().decode(body)).toBe('helloworld')

    await expect(
      readResponseBodyWithLimit(new Response(makeStream(['hello', 'world'])), 5),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE',
    })
  })
})

describe('auth proxy header helpers', () => {
  it('strips hop-by-hop headers and preserves useful headers', () => {
    const event = {
      headers: new Headers({
        host: 'app.example.com',
        cookie: 'a=1',
        origin: 'https://app.example.com',
        accept: 'application/json',
        connection: 'keep-alive',
        'transfer-encoding': 'chunked',
      }),
    } as never

    const headers = buildAuthProxyForwardHeaders(event, {
      requestUrl: new URL('https://app.example.com/api/auth/convex/token'),
      originalHost: 'app.example.com',
    })

    expect(headers.cookie).toBe('a=1')
    expect(headers.accept).toBe('application/json')
    expect(headers.origin).toBe('https://app.example.com')
    expect(headers.connection).toBeUndefined()
    expect(headers['transfer-encoding']).toBeUndefined()
    expect(headers.host).toBeUndefined()
  })

  it('injects forwarded host and proto', () => {
    const event = { headers: new Headers() } as never
    const headers = buildAuthProxyForwardHeaders(event, {
      requestUrl: new URL('https://preview.example.com/api/auth/get-session?x=1'),
      originalHost: 'app.example.com:3000',
    })

    expect(headers['x-forwarded-host']).toBe('app.example.com:3000')
    expect(headers['x-forwarded-proto']).toBe('https')
  })

  it('skips unsafe proxy response headers', () => {
    expect(shouldSkipProxyResponseHeader('set-cookie')).toBe(true)
    expect(shouldSkipProxyResponseHeader('Content-Length')).toBe(true)
    expect(shouldSkipProxyResponseHeader('connection')).toBe(true)
    expect(shouldSkipProxyResponseHeader('content-type')).toBe(false)
  })
})

describe('auth proxy canonical redirect handling', () => {
  describe('normalizePathname', () => {
    it('removes trailing slashes while preserving root', () => {
      expect(normalizePathname('/api/auth/sign-up/email/')).toBe('/api/auth/sign-up/email')
      expect(normalizePathname('/')).toBe('/')
    })
  })

  describe('getCanonicalRedirectTarget', () => {
    it('returns redirect target only when redirect stays on the allowed origin', () => {
      const target = getCanonicalRedirectTarget(
        'https://app.example.com/api/auth/sign-up/email?foo=bar',
        'https://demo.convex.site/api/auth/sign-up/email?foo=bar',
        'https://demo.convex.site',
      )
      expect(target).toBe('https://demo.convex.site/api/auth/sign-up/email?foo=bar')
    })

    it('returns null for canonical-looking redirects to a different origin', () => {
      const target = getCanonicalRedirectTarget(
        'https://demo.convex.site/api/auth/sign-up/email?foo=bar',
        'https://evil.example.com/api/auth/sign-up/email?foo=bar',
        'https://demo.convex.site',
      )
      expect(target).toBeNull()
    })

    it('returns null for different path redirects', () => {
      const target = getCanonicalRedirectTarget(
        'https://demo.convex.site/api/auth/sign-up/email',
        'https://demo.convex.site/oauth/authorize',
        'https://demo.convex.site',
      )
      expect(target).toBeNull()
    })
  })

  describe('fetchWithCanonicalRedirects', () => {
    it('follows canonical redirects only when they stay on the allowed origin', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://demo.convex.site/api/auth/sign-up/email?foo=bar',
            },
          }),
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      const response = await fetchWithCanonicalRedirects({
        target: 'https://demo.convex.cloud/api/auth/sign-up/email?foo=bar',
        allowedOrigin: 'https://demo.convex.site',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"email":"test@example.com"}',
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [firstCall, secondCall] = fetchMock.mock.calls
      expect(firstCall).toBeDefined()
      expect(secondCall).toBeDefined()
      if (!firstCall || !secondCall) {
        throw new Error('Expected two fetch calls')
      }
      expect(firstCall[0]).toBe('https://demo.convex.cloud/api/auth/sign-up/email?foo=bar')
      expect(secondCall[0]).toBe('https://demo.convex.site/api/auth/sign-up/email?foo=bar')
    })

    it('does not follow provider redirects (oauth style)', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response('', {
          status: 302,
          headers: {
            location: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc',
          },
        }),
      )

      const response = await fetchWithCanonicalRedirects({
        target: 'https://demo.convex.site/api/auth/sign-in/social',
        allowedOrigin: 'https://demo.convex.site',
        method: 'GET',
        headers: {},
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(302)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not follow canonical-looking redirects to an off-origin host', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response('', {
          status: 307,
          headers: {
            location: 'https://evil.example.com/api/auth/sign-up/email',
          },
        }),
      )

      const response = await fetchWithCanonicalRedirects({
        target: 'https://demo.convex.site/api/auth/sign-up/email',
        allowedOrigin: 'https://demo.convex.site',
        method: 'POST',
        headers: {},
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(307)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('stops after max allowed-origin canonical redirects', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://demo.convex.site/api/auth/sign-up/email',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://demo.convex.site/api/auth/sign-up/email',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://demo.convex.site/api/auth/sign-up/email',
            },
          }),
        )

      const response = await fetchWithCanonicalRedirects({
        target: 'https://demo.convex.cloud/api/auth/sign-up/email',
        allowedOrigin: 'https://demo.convex.site',
        method: 'POST',
        headers: {},
        maxRedirects: 2,
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(307)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })
})

describe('auth proxy security helpers', () => {
  describe('isOriginAllowed', () => {
    it('allows exact same origin', () => {
      expect(isOriginAllowed('https://example.com', 'https://example.com', [])).toBe(true)
    })

    it('rejects same host with different scheme', () => {
      expect(isOriginAllowed('http://example.com', 'https://example.com', [])).toBe(false)
    })

    it('rejects same host with different port', () => {
      expect(isOriginAllowed('https://example.com:444', 'https://example.com:443', [])).toBe(false)
    })

    it('allows trusted exact origins', () => {
      expect(
        isOriginAllowed('https://preview.example.com', 'https://app.example.com', [
          'https://preview.example.com',
        ]),
      ).toBe(true)
    })

    it('allows trusted wildcard origins', () => {
      expect(
        isOriginAllowed('https://preview-123.vercel.app', 'https://app.example.com', [
          'https://preview-*.vercel.app',
        ]),
      ).toBe(true)
    })

    it('rejects wildcard suffix-trick domains', () => {
      expect(
        isOriginAllowed('https://preview-123.vercel.app.evil.com', 'https://app.example.com', [
          'https://preview-*.vercel.app',
        ]),
      ).toBe(false)
    })

    it('rejects extra subdomain depth when wildcard only matches one label', () => {
      expect(
        isOriginAllowed('https://foo.bar.example.com', 'https://app.example.com', [
          'https://*.example.com',
        ]),
      ).toBe(false)
    })

    it('rejects trusted origin entries with paths (not origin patterns)', () => {
      expect(
        isOriginAllowed('https://preview.example.com', 'https://app.example.com', [
          'https://preview.example.com/path',
        ]),
      ).toBe(false)
    })

    it('fails closed on malformed trusted origin patterns', () => {
      expect(
        isOriginAllowed('https://preview.example.com', 'https://app.example.com', ['not-a-url']),
      ).toBe(false)
    })
  })

  describe('getAuthRoutePattern', () => {
    it('escapes regex characters and strips configured auth route prefix', () => {
      const pattern = getAuthRoutePattern('/api/auth.v2')
      expect('/api/auth.v2/convex/token'.replace(pattern, '')).toBe('/convex/token')
    })

    it('caches compiled regex instances per route', () => {
      expect(getAuthRoutePattern('/api/auth')).toBe(getAuthRoutePattern('/api/auth'))
    })
  })
})

const getConvexRuntimeConfigMock = vi.fn()
const fetchWithCanonicalRedirectsMock = vi.fn()
const serverConvexClearAuthCacheMock = vi.fn()
const buildAuthProxyForwardHeadersMock = vi.fn()
const shouldSkipProxyResponseHeaderMock = vi.fn()
const getAuthRoutePatternMock = vi.fn()
const isOriginAllowedMock = vi.fn()
const readRequestBodyWithLimitMock = vi.fn()
const readResponseBodyWithLimitMock = vi.fn()
const getRequestBodySizeErrorMock = vi.fn()
const getResponseBodySizeErrorMock = vi.fn()

interface CreateEventOptions {
  cookie?: string
  method?: string
  origin?: string
  rawPathname?: string
}

function createEvent(pathname: string, options: CreateEventOptions = {}) {
  const url = new URL(`https://app.example.com${pathname}`)
  const headers = new Headers()
  if (options.cookie) {
    headers.set('cookie', options.cookie)
  }
  if (options.origin) {
    headers.set('origin', options.origin)
  }

  return {
    method: options.method ?? 'POST',
    headers,
    __url: {
      origin: url.origin,
      host: url.host,
      search: url.search,
      pathname: options.rawPathname ?? url.pathname,
    },
    __headers: {},
    __appendedHeaders: [],
    __status: null,
  } as Record<string, unknown>
}

function createResponseWithCookies(status: number, cookies: string[], body = '{"ok":true}') {
  const headers = new Headers({ 'content-type': 'application/json' })
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie)
  }
  const response = new Response(body, { status, headers })
  Object.defineProperty(response.headers, 'getSetCookie', {
    value: () => cookies,
  })
  return response
}

async function loadAuthProxyHandler() {
  const mod = await import('../../src/runtime/server/api/auth/[...]')
  return mod.default as unknown as (event: Record<string, unknown>) => Promise<unknown>
}

describe('auth proxy handler hardening', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.doMock('h3', () => ({
      appendResponseHeader: (
        event: Record<string, unknown>,
        key: string,
        value: string,
      ) => {
        const headers =
          (event.__appendedHeaders as Array<{ key: string; value: string }> | undefined) ?? []
        headers.push({ key, value })
        event.__appendedHeaders = headers
      },
      createError: (input: Record<string, unknown>) =>
        Object.assign(new Error(String(input.message)), input),
      defineEventHandler: (handler: unknown) => handler,
      getRequestURL: (event: Record<string, unknown>) => event.__url,
      send: (_event: unknown, body: unknown) => body,
      setHeaders: (event: Record<string, unknown>, headers: Record<string, string>) => {
        const current = (event.__headers as Record<string, string> | undefined) ?? {}
        event.__headers = { ...current, ...headers }
      },
      setResponseStatus: (
        event: Record<string, unknown>,
        statusCode: number,
        statusText?: string,
      ) => {
        event.__status = { statusCode, statusText }
      },
    }))

    vi.doMock('../../src/runtime/utils/runtime-config', () => ({
      getConvexRuntimeConfig: getConvexRuntimeConfigMock,
    }))
    vi.doMock('../../src/runtime/server/api/auth/redirect-utils', () => ({
      fetchWithCanonicalRedirects: fetchWithCanonicalRedirectsMock,
    }))
    vi.doMock('../../src/runtime/server/utils/auth-cache', () => ({
      serverConvexClearAuthCache: serverConvexClearAuthCacheMock,
    }))
    vi.doMock('../../src/runtime/server/api/auth/headers', () => ({
      buildAuthProxyForwardHeaders: buildAuthProxyForwardHeadersMock,
      shouldSkipProxyResponseHeader: shouldSkipProxyResponseHeaderMock,
    }))
    vi.doMock('../../src/runtime/server/api/auth/security', () => ({
      getAuthRoutePattern: getAuthRoutePatternMock,
      isOriginAllowed: isOriginAllowedMock,
    }))
    vi.doMock('../../src/runtime/server/api/auth/body-size', () => ({
      getRequestBodySizeError: getRequestBodySizeErrorMock,
      getResponseBodySizeError: getResponseBodySizeErrorMock,
      readRequestBodyWithLimit: readRequestBodyWithLimitMock,
      readResponseBodyWithLimit: readResponseBodyWithLimitMock,
    }))

    getConvexRuntimeConfigMock.mockReturnValue({
      url: 'https://demo.convex.cloud',
      siteUrl: 'https://demo.convex.site',
      auth: {
        route: '/api/auth',
        trustedOrigins: [],
        proxy: {
          maxRequestBodyBytes: 1024 * 1024,
          maxResponseBodyBytes: 1024 * 1024,
        },
      },
    })
    buildAuthProxyForwardHeadersMock.mockReturnValue({
      cookie: 'better-auth.session_token=session123',
    })
    shouldSkipProxyResponseHeaderMock.mockReturnValue(false)
    getAuthRoutePatternMock.mockReturnValue(/^\/api\/auth/)
    isOriginAllowedMock.mockReturnValue(true)
    getRequestBodySizeErrorMock.mockReturnValue(null)
    getResponseBodySizeErrorMock.mockReturnValue(null)
    readRequestBodyWithLimitMock.mockResolvedValue(undefined)
    readResponseBodyWithLimitMock.mockResolvedValue('{"ok":true}')
    serverConvexClearAuthCacheMock.mockResolvedValue(undefined)
  })

  it('clears the cached JWT when upstream logout clears the Better Auth session cookie', async () => {
    fetchWithCanonicalRedirectsMock.mockResolvedValue(
      createResponseWithCookies(200, ['better-auth.session_token=; Max-Age=0; Path=/; HttpOnly']),
    )

    const handler = await loadAuthProxyHandler()
    const event = createEvent('/api/auth/sign-out', {
      cookie: 'better-auth.session_token=session123',
    })

    await expect(handler(event)).resolves.toBe('{"ok":true}')

    expect(serverConvexClearAuthCacheMock).toHaveBeenCalledTimes(1)
    expect(serverConvexClearAuthCacheMock).toHaveBeenCalledWith('session123')
  })

  it.each(['/api/auth/convex/token', '/api/auth/get-session'])(
    'fails closed when %s redirects to a different origin',
    async (pathname) => {
      const handler = await loadAuthProxyHandler()
      const event = createEvent(pathname, {
        method: 'GET',
        cookie: 'better-auth.session_token=session123',
      })

      fetchWithCanonicalRedirectsMock.mockResolvedValueOnce(
        new Response('', {
          status: 307,
          headers: { location: `https://evil.example.com${pathname}` },
        }),
      )

      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 502,
        data: {
          code: 'BCN_AUTH_PROXY_UPSTREAM_STATUS',
          path: pathname.replace('/api/auth', ''),
          upstreamStatus: 307,
        },
      })

      expect(serverConvexClearAuthCacheMock).not.toHaveBeenCalled()
      expect(fetchWithCanonicalRedirectsMock).toHaveBeenCalledTimes(1)
      expect(fetchWithCanonicalRedirectsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedOrigin: 'https://demo.convex.site',
        }),
      )
    },
  )

  it.each(['/api/auth/convex/token', '/api/auth/get-session'])(
    'returns 405 with Allow header for unsupported critical endpoint methods on %s',
    async (pathname) => {
      const handler = await loadAuthProxyHandler()

      for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
        const event = createEvent(pathname, { method })

        await expect(handler(event)).rejects.toMatchObject({
          statusCode: 405,
          data: { code: 'BCN_AUTH_PROXY_METHOD_NOT_ALLOWED' },
        })

        expect(event.__headers).toMatchObject({
          Allow: 'GET, OPTIONS',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
      }

      expect(fetchWithCanonicalRedirectsMock).not.toHaveBeenCalled()
    },
  )

  it.each(['/api/auth/convex/token', '/api/auth/get-session'])(
    'returns endpoint-specific preflight allow methods for %s',
    async (pathname) => {
      const handler = await loadAuthProxyHandler()
      const event = createEvent(pathname, {
        method: 'OPTIONS',
        origin: 'https://app.example.com',
      })

      await expect(handler(event)).resolves.toBeNull()

      expect(event.__status).toEqual({ statusCode: 204, statusText: undefined })
      expect(event.__headers).toMatchObject({
        'Access-Control-Allow-Origin': 'https://app.example.com',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Credentials': 'true',
      })
      expect(fetchWithCanonicalRedirectsMock).not.toHaveBeenCalled()
    },
  )

  it('rejects untrusted preflight origins with 403', async () => {
    isOriginAllowedMock.mockReturnValue(false)

    const handler = await loadAuthProxyHandler()
    const event = createEvent('/api/auth/get-session', {
      method: 'OPTIONS',
      origin: 'https://evil.example.com',
    })

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 403,
      data: {
        code: 'BCN_AUTH_PROXY_ORIGIN_BLOCKED',
        origin: 'https://evil.example.com',
      },
    })

    expect(fetchWithCanonicalRedirectsMock).not.toHaveBeenCalled()
  })

  it('rejects untrusted cross-origin non-preflight requests with 403', async () => {
    isOriginAllowedMock.mockReturnValue(false)

    const handler = await loadAuthProxyHandler()
    const event = createEvent('/api/auth/sign-in', {
      method: 'POST',
      origin: 'https://evil.example.com',
    })

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 403,
      data: {
        code: 'BCN_AUTH_PROXY_ORIGIN_BLOCKED',
        origin: 'https://evil.example.com',
      },
    })

    expect(fetchWithCanonicalRedirectsMock).not.toHaveBeenCalled()
  })

  it.each([
    '/api/auth/../convex/token',
    '/api/auth/%2e%2e/convex/token',
    '/api/auth/%2e%2e%5Cconvex/token',
    '/api/auth/%252e%252e/convex/token',
    '/api/auth/%255cconvex/token',
  ])('rejects malformed traversal-like auth proxy paths for %s', async (pathname) => {
    const handler = await loadAuthProxyHandler()
    const event = createEvent(pathname, {
      method: 'GET',
      rawPathname: pathname,
    })

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 404,
      data: { code: 'BCN_AUTH_PROXY_INVALID_PATH' },
    })

    expect(event.__headers).toMatchObject({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    expect(fetchWithCanonicalRedirectsMock).not.toHaveBeenCalled()
  })

  it('returns 413 before proxying oversized request bodies', async () => {
    getRequestBodySizeErrorMock.mockReturnValue({
      statusCode: 413,
      code: 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE',
      message: 'too large',
      contentLengthBytes: 2048,
      maxBytes: 1024,
    })

    const handler = await loadAuthProxyHandler()
    const event = createEvent('/api/auth/sign-in', {
      method: 'POST',
      origin: 'https://app.example.com',
    })

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 413,
      data: {
        code: 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE',
        contentLengthBytes: 2048,
        maxBytes: 1024,
      },
    })

    expect(readRequestBodyWithLimitMock).not.toHaveBeenCalled()
    expect(fetchWithCanonicalRedirectsMock).not.toHaveBeenCalled()
  })

  it('returns 502 before forwarding oversized upstream response bodies', async () => {
    fetchWithCanonicalRedirectsMock.mockResolvedValue(
      createResponseWithCookies(200, [], '{"ok":true}'),
    )
    getResponseBodySizeErrorMock.mockReturnValue({
      statusCode: 502,
      code: 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE',
      message: 'too large',
      contentLengthBytes: 4096,
      maxBytes: 1024,
    })

    const handler = await loadAuthProxyHandler()
    const event = createEvent('/api/auth/get-session', {
      method: 'GET',
      origin: 'https://app.example.com',
    })

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 502,
      data: {
        code: 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE',
        contentLengthBytes: 4096,
        maxBytes: 1024,
      },
    })

    expect(readResponseBodyWithLimitMock).not.toHaveBeenCalled()
  })

  it('does not clear cached auth state for unrelated upstream cookies', async () => {
    fetchWithCanonicalRedirectsMock.mockResolvedValue(
      createResponseWithCookies(200, ['theme=dark; Path=/']),
    )

    const handler = await loadAuthProxyHandler()
    const event = createEvent('/api/auth/sign-out', {
      cookie: 'better-auth.session_token=session123',
    })

    await expect(handler(event)).resolves.toBe('{"ok":true}')

    expect(serverConvexClearAuthCacheMock).not.toHaveBeenCalled()
  })
})
