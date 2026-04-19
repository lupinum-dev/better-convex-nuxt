import { beforeEach, describe, expect, it } from 'vitest'

import {
  createEvent,
  createResponseWithCookies,
  fetchWithCanonicalRedirectsMock,
  getRequestBodySizeErrorMock,
  getResponseBodySizeErrorMock,
  isOriginAllowedMock,
  loadAuthProxyHandler,
  readRequestBodyWithLimitMock,
  readResponseBodyWithLimitMock,
  resetAuthProxyHandlerHarness,
  serverConvexClearAuthCacheMock,
} from '../support/unit/auth-proxy-handler-harness'

describe('auth proxy handler hardening', () => {
  beforeEach(() => {
    resetAuthProxyHandlerHarness()
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

  it('does not fail the proxy response when cache eviction throws after upstream logout', async () => {
    fetchWithCanonicalRedirectsMock.mockResolvedValue(
      createResponseWithCookies(200, ['better-auth.session_token=; Max-Age=0; Path=/; HttpOnly']),
    )
    serverConvexClearAuthCacheMock.mockRejectedValueOnce(new Error('Redis unavailable'))

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
