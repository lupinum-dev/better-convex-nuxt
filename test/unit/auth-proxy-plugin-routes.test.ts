import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appendResponseHeaderMock,
  createErrorMock,
  getConvexRuntimeConfigMock,
  getRequestWebStreamMock,
  getRequestURLMock,
  sendMock,
  setHeadersMock,
  setResponseStatusMock,
  fetchWithCanonicalRedirectsMock,
} = vi.hoisted(() => ({
  appendResponseHeaderMock: vi.fn(),
  createErrorMock: vi.fn((input: { statusCode: number; message: string; data?: unknown }) => {
    const error = new Error(input.message) as Error & { statusCode: number; data?: unknown }
    error.statusCode = input.statusCode
    error.data = input.data
    return error
  }),
  getConvexRuntimeConfigMock: vi.fn(),
  getRequestWebStreamMock: vi.fn((event: { body?: string }) => {
    if (event.body === undefined) return undefined
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(event.body))
        controller.close()
      },
    })
  }),
  getRequestURLMock: vi.fn(),
  sendMock: vi.fn((_event: unknown, body: Uint8Array) => body),
  setHeadersMock: vi.fn(),
  setResponseStatusMock: vi.fn(),
  fetchWithCanonicalRedirectsMock: vi.fn(),
}))

vi.mock('h3', () => ({
  appendResponseHeader: appendResponseHeaderMock,
  createError: createErrorMock,
  defineEventHandler: (handler: unknown) => handler,
  getRequestWebStream: getRequestWebStreamMock,
  getRequestURL: getRequestURLMock,
  send: sendMock,
  setHeaders: setHeadersMock,
  setResponseStatus: setResponseStatusMock,
}))

vi.mock('../../src/runtime/utils/runtime-config', () => ({
  getConvexRuntimeConfig: getConvexRuntimeConfigMock,
}))

vi.mock('../../src/runtime/server/api/auth/redirect-utils', () => ({
  fetchWithCanonicalRedirects: fetchWithCanonicalRedirectsMock,
}))

function createEvent(method: string): { method: string; headers: Headers; body?: string } {
  return {
    method,
    body: method === 'GET' ? undefined : '{"name":"Demo workspace"}',
    headers: new Headers({
      accept: 'application/json',
      authorization: 'Bearer browser-session-token',
      cookie:
        'better-auth.session_token=session-token; private_app_cookie=secret; __Secure-better-auth.callback=value',
      host: 'app.example.com',
      origin: 'https://app.example.com',
      'content-length': method === 'GET' ? '0' : '25',
      'content-type': 'application/json',
    }),
  }
}

describe('auth proxy Better Auth plugin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConvexRuntimeConfigMock.mockReturnValue({
      url: 'https://demo.convex.cloud',
      siteUrl: 'https://demo.convex.site',
      auth: {
        route: '/api/auth',
        trustedOrigins: [],
        cache: false,
        proxy: { maxRequestBodyBytes: 1024 * 1024, maxResponseBodyBytes: 1024 * 1024 },
        debug: { authFlow: false, clientAuthFlow: false, serverAuthFlow: false },
        routeProtection: { redirectTo: '/auth/signin', preserveReturnTo: true },
      },
    })
    fetchWithCanonicalRedirectsMock.mockResolvedValue({
      response: new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      followedCanonicalRedirect: false,
    })
  })

  it.each([
    {
      name: 'Admin',
      method: 'GET',
      route: '/api/auth/admin/list-users?limit=10',
      target: 'https://demo.convex.site/api/auth/admin/list-users?limit=10',
      body: undefined,
    },
    {
      name: 'Organization',
      method: 'POST',
      route: '/api/auth/organization/create',
      target: 'https://demo.convex.site/api/auth/organization/create',
      body: '{"name":"Demo workspace"}',
    },
    {
      name: 'API Key',
      method: 'POST',
      route: '/api/auth/api-key/create',
      target: 'https://demo.convex.site/api/auth/api-key/create',
      body: '{"name":"Demo workspace"}',
    },
  ])('forwards $name plugin route through the generic auth proxy', async (fixture) => {
    getRequestURLMock.mockReturnValue(new URL(`https://app.example.com${fixture.route}`))

    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
    const result = await handler(createEvent(fixture.method))

    expect(fetchWithCanonicalRedirectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: fixture.target,
        method: fixture.method,
        body: fixture.body,
      }),
    )

    const forwardedHeaders = fetchWithCanonicalRedirectsMock.mock.calls[0]?.[0].headers
    expect(forwardedHeaders).toEqual(
      expect.objectContaining({
        accept: 'application/json',
        authorization: 'Bearer browser-session-token',
        cookie: 'better-auth.session_token=session-token; __Secure-better-auth.callback=value',
        origin: 'https://app.example.com',
        'x-forwarded-host': 'app.example.com',
        'x-forwarded-proto': 'https',
      }),
    )
    expect(forwardedHeaders.cookie).not.toContain('private_app_cookie')
    expect(setResponseStatusMock).toHaveBeenCalledWith(expect.anything(), 200, '')
    expect(setHeadersMock).toHaveBeenCalledWith(expect.anything(), {
      'Access-Control-Allow-Origin': 'https://app.example.com',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'Set-Cookie',
    })
    expect(sendMock).toHaveBeenCalled()
    expect(new TextDecoder().decode(result)).toBe(JSON.stringify({ ok: true }))
    expect(appendResponseHeaderMock).not.toHaveBeenCalled()
  })

  it('forces no-store on token-bearing auth responses after forwarding upstream headers', async () => {
    fetchWithCanonicalRedirectsMock.mockResolvedValue({
      response: new Response(JSON.stringify({ token: 'jwt' }), {
        status: 200,
        headers: {
          'cache-control': 'public, max-age=60',
          'content-type': 'application/json',
        },
      }),
      followedCanonicalRedirect: false,
    })
    getRequestURLMock.mockReturnValue(new URL('https://app.example.com/api/auth/convex/token'))

    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
    await handler(createEvent('POST'))

    const cacheControlCalls = setHeadersMock.mock.calls.filter(
      (call) => (call[1] as Record<string, string>)['cache-control'],
    )
    expect(cacheControlCalls.map((call) => call[1])).toEqual([
      { 'cache-control': 'public, max-age=60' },
      { 'cache-control': 'private, no-store' },
    ])
  })

  it('does not forward final Set-Cookie after a followed canonical redirect', async () => {
    fetchWithCanonicalRedirectsMock.mockResolvedValue({
      response: new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'better-auth.session_token=foreign; Path=/; HttpOnly',
        },
      }),
      followedCanonicalRedirect: true,
    })
    getRequestURLMock.mockReturnValue(new URL('https://app.example.com/api/auth/get-session'))

    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
    await handler(createEvent('GET'))

    expect(appendResponseHeaderMock).not.toHaveBeenCalled()
  })
})
