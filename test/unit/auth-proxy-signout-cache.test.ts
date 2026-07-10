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
  serverConvexClearAuthCacheMock,
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
  serverConvexClearAuthCacheMock: vi.fn(),
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

vi.mock('../../src/runtime/server/utils/auth-cache', () => ({
  serverConvexClearAuthCache: serverConvexClearAuthCacheMock,
}))

function createEvent(
  method: string,
  cookie = 'better-auth.session_token=session-token; private_app_cookie=secret',
): { method: string; headers: Headers; body?: string } {
  return {
    method,
    body: undefined,
    headers: new Headers({
      accept: 'application/json',
      cookie,
      host: 'app.example.com',
      origin: 'https://app.example.com',
      'content-length': '0',
    }),
  }
}

describe('auth proxy sign-out cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConvexRuntimeConfigMock.mockReturnValue({
      url: 'https://demo.convex.cloud',
      siteUrl: 'https://demo.convex.site',
      auth: {
        route: '/api/auth',
        trustedOrigins: [],
        cache: { ttl: 60 },
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

  it('clears the cached token for the session on a successful sign-out', async () => {
    getRequestURLMock.mockReturnValue(new URL('https://app.example.com/api/auth/sign-out'))

    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
    await handler(createEvent('POST'))

    expect(serverConvexClearAuthCacheMock).toHaveBeenCalledTimes(1)
    expect(serverConvexClearAuthCacheMock).toHaveBeenCalledWith('session-token')
  })

  it.each(['/revoke-session', '/revoke-sessions', '/revoke-other-sessions', '/delete-user'])(
    'clears the cached token for Better Auth revocation route %s',
    async (route) => {
      getRequestURLMock.mockReturnValue(new URL(`https://app.example.com/api/auth${route}`))

      const handler = (await import('../../src/runtime/server/api/auth/[...]'))
        .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
      await handler(createEvent('POST'))

      expect(serverConvexClearAuthCacheMock).toHaveBeenCalledTimes(1)
      expect(serverConvexClearAuthCacheMock).toHaveBeenCalledWith('session-token')
    },
  )

  it('detects trailing-slash revocation without changing the upstream proxy target', async () => {
    getRequestURLMock.mockReturnValue(new URL('https://app.example.com/api/auth/sign-out/'))

    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
    await handler(createEvent('POST'))

    expect(serverConvexClearAuthCacheMock).toHaveBeenCalledWith('session-token')
    expect(fetchWithCanonicalRedirectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'https://demo.convex.site/api/auth/sign-out/',
      }),
    )
  })

  it('does not clear the cache when authCache is disabled', async () => {
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
    getRequestURLMock.mockReturnValue(new URL('https://app.example.com/api/auth/sign-out'))

    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
    await handler(createEvent('POST'))

    expect(serverConvexClearAuthCacheMock).not.toHaveBeenCalled()
  })

  it('does not clear the cache when the upstream sign-out call fails', async () => {
    fetchWithCanonicalRedirectsMock.mockResolvedValue({
      response: new Response('', { status: 500 }),
      followedCanonicalRedirect: false,
    })
    getRequestURLMock.mockReturnValue(new URL('https://app.example.com/api/auth/sign-out'))

    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
    await handler(createEvent('POST'))

    expect(serverConvexClearAuthCacheMock).not.toHaveBeenCalled()
  })

  it('does not clear the cache for non-sign-out routes', async () => {
    getRequestURLMock.mockReturnValue(new URL('https://app.example.com/api/auth/get-session'))

    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
    await handler(createEvent('GET'))

    expect(serverConvexClearAuthCacheMock).not.toHaveBeenCalled()
  })

  it('does not clear the cache when sign-out is called without a session cookie', async () => {
    getRequestURLMock.mockReturnValue(new URL('https://app.example.com/api/auth/sign-out'))

    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (event: ReturnType<typeof createEvent>) => Promise<Uint8Array>
    await handler(createEvent('POST', ''))

    expect(serverConvexClearAuthCacheMock).not.toHaveBeenCalled()
  })
})
