import { vi } from 'vitest'

export const getConvexRuntimeConfigMock = vi.fn()
export const fetchWithCanonicalRedirectsMock = vi.fn()
export const serverConvexClearAuthCacheMock = vi.fn()
export const buildAuthProxyForwardHeadersMock = vi.fn()
export const shouldSkipProxyResponseHeaderMock = vi.fn()
export const getAuthRoutePatternMock = vi.fn()
export const isOriginAllowedMock = vi.fn()
export const readRequestBodyWithLimitMock = vi.fn()
export const readResponseBodyWithLimitMock = vi.fn()
export const getRequestBodySizeErrorMock = vi.fn()
export const getResponseBodySizeErrorMock = vi.fn()

export interface CreateEventOptions {
  cookie?: string
  method?: string
  origin?: string
  rawPathname?: string
}

export function createEvent(pathname: string, options: CreateEventOptions = {}) {
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

export function createResponseWithCookies(status: number, cookies: string[], body = '{"ok":true}') {
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

export async function loadAuthProxyHandler() {
  const mod = await import('../../../src/runtime/auth/server/api/auth/[...]')
  return mod.default as unknown as (event: Record<string, unknown>) => Promise<unknown>
}

export function resetAuthProxyHandlerHarness() {
  vi.resetModules()
  vi.clearAllMocks()

  vi.doMock('h3', () => ({
    appendResponseHeader: (event: Record<string, unknown>, key: string, value: string) => {
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

  vi.doMock('../../../src/runtime/convex/shared/runtime-config', () => ({
    getConvexRuntimeConfig: getConvexRuntimeConfigMock,
  }))
  vi.doMock('../../../src/runtime/auth/server/api/auth/redirect-utils', () => ({
    fetchWithCanonicalRedirects: fetchWithCanonicalRedirectsMock,
  }))
  vi.doMock('../../../src/runtime/auth/server/auth-cache', () => ({
    serverConvexClearAuthCache: serverConvexClearAuthCacheMock,
  }))
  vi.doMock('../../../src/runtime/auth/server/api/auth/headers', () => ({
    buildAuthProxyForwardHeaders: buildAuthProxyForwardHeadersMock,
    shouldSkipProxyResponseHeader: shouldSkipProxyResponseHeaderMock,
  }))
  vi.doMock('../../../src/runtime/auth/server/api/auth/security', () => ({
    getAuthRoutePattern: getAuthRoutePatternMock,
    isOriginAllowed: isOriginAllowedMock,
  }))
  vi.doMock('../../../src/runtime/auth/server/api/auth/body-size', () => ({
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
}
