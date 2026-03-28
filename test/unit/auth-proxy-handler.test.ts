import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getConvexRuntimeConfigMock,
  fetchWithCanonicalRedirectsMock,
  serverConvexClearAuthCacheMock,
  buildAuthProxyForwardHeadersMock,
  shouldSkipProxyResponseHeaderMock,
  getAuthRoutePatternMock,
  isOriginAllowedMock,
  readRequestBodyWithLimitMock,
  readResponseBodyWithLimitMock,
  getRequestBodySizeErrorMock,
  getResponseBodySizeErrorMock,
} = vi.hoisted(() => ({
  getConvexRuntimeConfigMock: vi.fn(),
  fetchWithCanonicalRedirectsMock: vi.fn(),
  serverConvexClearAuthCacheMock: vi.fn(),
  buildAuthProxyForwardHeadersMock: vi.fn(),
  shouldSkipProxyResponseHeaderMock: vi.fn(),
  getAuthRoutePatternMock: vi.fn(),
  isOriginAllowedMock: vi.fn(),
  readRequestBodyWithLimitMock: vi.fn(),
  readResponseBodyWithLimitMock: vi.fn(),
  getRequestBodySizeErrorMock: vi.fn(),
  getResponseBodySizeErrorMock: vi.fn(),
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
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
  createError: (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input),
  getRequestURL: (event: Record<string, unknown>) => event.__url,
  send: (_event: unknown, body: unknown) => body,
  appendResponseHeader: (
    event: Record<string, unknown>,
    key: string,
    value: string,
  ) => {
    const headers = (event.__appendedHeaders as Array<{ key: string, value: string }> | undefined) ?? []
    headers.push({ key, value })
    event.__appendedHeaders = headers
  },
}))

vi.mock('../../src/runtime/utils/runtime-config', () => ({
  getConvexRuntimeConfig: getConvexRuntimeConfigMock,
}))

vi.mock('../../src/runtime/server/api/auth/redirect-utils', () => ({
  fetchWithCanonicalRedirects: fetchWithCanonicalRedirectsMock,
}))

vi.mock('../../src/runtime/server/utils/auth-cache', () => ({
  serverConvexClearAuthCache: serverConvexClearAuthCacheMock,
}))

vi.mock('../../src/runtime/server/api/auth/headers', () => ({
  buildAuthProxyForwardHeaders: buildAuthProxyForwardHeadersMock,
  shouldSkipProxyResponseHeader: shouldSkipProxyResponseHeaderMock,
}))

vi.mock('../../src/runtime/server/api/auth/security', () => ({
  getAuthRoutePattern: getAuthRoutePatternMock,
  isOriginAllowed: isOriginAllowedMock,
}))

vi.mock('../../src/runtime/server/api/auth/body-size', () => ({
  getRequestBodySizeError: getRequestBodySizeErrorMock,
  getResponseBodySizeError: getResponseBodySizeErrorMock,
  readRequestBodyWithLimit: readRequestBodyWithLimitMock,
  readResponseBodyWithLimit: readResponseBodyWithLimitMock,
}))

function createEvent(pathname: string, cookie?: string) {
  return {
    method: 'POST',
    headers: new Headers(cookie ? { cookie } : {}),
    __url: new URL(`https://app.example.com${pathname}`),
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
    vi.clearAllMocks()

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
    buildAuthProxyForwardHeadersMock.mockReturnValue({ cookie: 'better-auth.session_token=session123' })
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
    const event = createEvent('/api/auth/sign-out', 'better-auth.session_token=session123')

    await expect(handler(event)).resolves.toBe('{"ok":true}')

    expect(serverConvexClearAuthCacheMock).toHaveBeenCalledTimes(1)
    expect(serverConvexClearAuthCacheMock).toHaveBeenCalledWith('session123')
  })

  it.each(['/api/auth/convex/token', '/api/auth/get-session'])(
    'fails closed when %s redirects to a different origin',
    async (pathname) => {
      const handler = await loadAuthProxyHandler()
      const event = createEvent(pathname, 'better-auth.session_token=session123')

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
})
