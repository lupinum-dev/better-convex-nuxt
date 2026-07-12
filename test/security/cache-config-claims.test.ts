import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { getToken as getOfficialConvexToken } from '@convex-dev/better-auth/utils'
import { getSessionCookie as getOfficialSessionCookie } from 'better-auth/cookies'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cacheUsableAuthToken,
  effectiveAuthCacheTtlSeconds,
  getCachedAuthToken,
  getUsableCachedAuthToken,
  isAuthTokenUsable,
  setCachedAuthToken,
} from '../../src/runtime/server/utils/auth-cache'
import { resolveServerAuthSnapshot } from '../../src/runtime/server/utils/auth-snapshot'
import { normalizeSiteUrl } from '../../src/runtime/server/utils/token-exchange'
import { normalizeConvexRuntimeConfig } from '../../src/runtime/utils/runtime-config-normalize'
import {
  filterBetterAuthCookies,
  getBetterAuthSessionToken,
} from '../../src/runtime/utils/shared-helpers'

const {
  appendResponseHeaderMock,
  cacheStorage,
  createErrorMock,
  fetchWithCanonicalRedirectsMock,
  getConvexRuntimeConfigMock,
  getRequestURLMock,
  getRequestWebStreamMock,
  sendMock,
  setHeadersMock,
  setResponseStatusMock,
  useStorageMock,
} = vi.hoisted(() => {
  const cacheStorage = new Map<string, unknown>()
  const storage = {
    async getItem<T>(key: string): Promise<T | null> {
      return (cacheStorage.get(key) as T | undefined) ?? null
    },
    async setItem(key: string, value: unknown): Promise<void> {
      cacheStorage.set(key, value)
    },
    async removeItem(key: string): Promise<void> {
      cacheStorage.delete(key)
    },
  }

  return {
    appendResponseHeaderMock: vi.fn(),
    cacheStorage,
    createErrorMock: vi.fn((input: { statusCode: number; message: string; data?: unknown }) => {
      const error = new Error(input.message) as Error & { statusCode: number; data?: unknown }
      error.statusCode = input.statusCode
      error.data = input.data
      return error
    }),
    fetchWithCanonicalRedirectsMock: vi.fn(),
    getConvexRuntimeConfigMock: vi.fn(),
    getRequestURLMock: vi.fn(),
    getRequestWebStreamMock: vi.fn((event: { body?: string }) => {
      if (event.body === undefined) return undefined
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(event.body))
          controller.close()
        },
      })
    }),
    sendMock: vi.fn((_event: unknown, body: Uint8Array) => body),
    setHeadersMock: vi.fn(),
    setResponseStatusMock: vi.fn(),
    useStorageMock: vi.fn(() => storage),
  }
})

vi.mock('nitropack/runtime', () => ({ useStorage: useStorageMock }))

vi.mock('h3', () => ({
  appendResponseHeader: appendResponseHeaderMock,
  createError: createErrorMock,
  defineEventHandler: (handler: unknown) => handler,
  getRequestURL: getRequestURLMock,
  getRequestWebStream: getRequestWebStreamMock,
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

interface ProxyEvent {
  method: string
  headers: Headers
  body?: string
}

function runtimeConfig(
  overrides: {
    siteUrl?: string
    route?: string
    cache?: false | { ttl: number }
  } = {},
) {
  return {
    url: 'https://demo.convex.cloud',
    siteUrl: overrides.siteUrl ?? 'https://demo.convex.site',
    auth: {
      route: overrides.route ?? '/api/auth',
      trustedOrigins: [],
      cache: overrides.cache ?? { ttl: 60 },
      proxy: { maxRequestBodyBytes: 1_048_576, maxResponseBodyBytes: 1_048_576 },
      debug: { authFlow: false, clientAuthFlow: false, serverAuthFlow: false },
      routeProtection: { redirectTo: '/auth/signin', preserveReturnTo: true },
    },
  }
}

function createEvent(method: string, options: { cookie?: string; body?: string } = {}): ProxyEvent {
  const body = options.body
  const headers = new Headers({
    accept: 'application/json',
    cookie:
      options.cookie ??
      'better-auth.session_token=session-A; private_app_cookie=must-not-be-forwarded',
    host: 'app.example.com',
    origin: 'https://app.example.com',
  })
  if (body !== undefined) {
    headers.set('content-type', 'application/json')
    headers.set('content-length', String(new TextEncoder().encode(body).byteLength))
  }
  return { method, headers, body }
}

async function invokeProxy(pathname: string, event: ProxyEvent): Promise<unknown> {
  getRequestURLMock.mockReturnValue(new URL(`https://app.example.com${pathname}`))
  const handler = (await import('../../src/runtime/server/api/auth/[...]')).default as unknown as (
    input: ProxyEvent,
  ) => Promise<unknown>
  return await handler(event)
}

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

function readInstalledPackageVersion(entryPath: string, packageName: string): string {
  let directory = dirname(entryPath)
  for (;;) {
    const packageJsonPath = join(directory, 'package.json')
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        name?: string
        version?: string
      }
      if (packageJson.name === packageName && packageJson.version) return packageJson.version
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Could not find package.json for ${packageName}`)
    directory = parent
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  cacheStorage.clear()
  getConvexRuntimeConfigMock.mockReturnValue(runtimeConfig())
  fetchWithCanonicalRedirectsMock.mockResolvedValue({
    response: new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    followedCanonicalRedirect: false,
  })
})

describe('pinned upstream contracts', () => {
  it('runs against the exact Better Auth and Convex adapter versions under review', () => {
    const require = createRequire(import.meta.url)

    expect(readInstalledPackageVersion(require.resolve('better-auth'), 'better-auth')).toBe(
      '1.6.23',
    )
    expect(
      readInstalledPackageVersion(
        require.resolve('@convex-dev/better-auth'),
        '@convex-dev/better-auth',
      ),
    ).toBe('0.12.5')
  })
})

describe('cookie contract divergences', () => {
  it('revives the non-secure cookie when the preferred secure cookie is explicitly empty', () => {
    const cookieHeader =
      'better-auth.session_token=stale-session; __Secure-better-auth.session_token='
    const headers = new Headers({ cookie: cookieHeader })

    // Better Auth 1.6.23 deliberately treats the empty secure cookie as authoritative.
    expect(getOfficialSessionCookie(headers)).toBeNull()

    // Current library behavior falls through because it uses truthiness (`secure || regular`).
    expect(getBetterAuthSessionToken(cookieHeader)).toBe('stale-session')
  })

  it('drops a custom Better Auth cookie prefix that Better Auth itself supports', () => {
    const cookieHeader = '__Secure-tenant-auth.session_token=custom-session'
    const headers = new Headers({ cookie: cookieHeader })

    expect(getOfficialSessionCookie(headers, { cookiePrefix: 'tenant-auth' })).toBe(
      'custom-session',
    )
    expect(getBetterAuthSessionToken(cookieHeader)).toBeNull()
    expect(filterBetterAuthCookies(cookieHeader)).toBeNull()
  })
})

describe('server auth cache characterization', () => {
  it('accepts and stores a cached JWT with no exp while the official adapter refreshes it', async () => {
    const noExpiryJwt = jwt({ sub: 'user-1', email: 'owner@example.com' })

    expect(isAuthTokenUsable(noExpiryJwt)).toBe(true)
    expect(effectiveAuthCacheTtlSeconds(noExpiryJwt, 60)).toBe(60)
    await cacheUsableAuthToken('session-A', noExpiryJwt, 60)
    await expect(getUsableCachedAuthToken('session-A')).resolves.toBe(noExpiryJwt)

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input instanceof Request ? input.url : String(input)).toBe(
        'https://demo.convex.site/api/auth/convex/token',
      )
      return new Response(JSON.stringify({ token: 'fresh.jwt' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const official = await getOfficialConvexToken(
      'https://demo.convex.site',
      new Headers({ cookie: `better-auth.convex_jwt=${noExpiryJwt}` }),
      {
        jwtCache: { enabled: true, isAuthError: () => false },
      },
    )

    expect(official).toEqual({ isFresh: true, token: 'fresh.jwt' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('has only per-session keys, so revoke-session(B) clears caller A and leaves B cached', async () => {
    await setCachedAuthToken('session-A', 'jwt-for-A', 60)
    await setCachedAuthToken('session-B', 'jwt-for-B', 60)

    await invokeProxy(
      '/api/auth/revoke-session',
      createEvent('POST', { body: JSON.stringify({ token: 'session-B' }) }),
    )

    await expect(getCachedAuthToken('session-A')).resolves.toBeNull()
    await expect(getCachedAuthToken('session-B')).resolves.toBe('jwt-for-B')
    expect(fetchWithCanonicalRedirectsMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: JSON.stringify({ token: 'session-B' }) }),
    )
  })

  it('clears caller A for revoke-other-sessions while leaving revoked B and C cached', async () => {
    await setCachedAuthToken('session-A', 'jwt-for-A', 60)
    await setCachedAuthToken('session-B', 'jwt-for-B', 60)
    await setCachedAuthToken('session-C', 'jwt-for-C', 60)

    await invokeProxy('/api/auth/revoke-other-sessions', createEvent('POST', { body: '{}' }))

    await expect(getCachedAuthToken('session-A')).resolves.toBeNull()
    await expect(getCachedAuthToken('session-B')).resolves.toBe('jwt-for-B')
    await expect(getCachedAuthToken('session-C')).resolves.toBe('jwt-for-C')
  })

  it.each(['/revoke-sessions', '/delete-user'])(
    'clears only caller A for broad revocation endpoint %s',
    async (endpoint) => {
      await setCachedAuthToken('session-A', 'jwt-for-A', 60)
      await setCachedAuthToken('session-B', 'jwt-for-B', 60)
      await setCachedAuthToken('session-C', 'jwt-for-C', 60)

      await invokeProxy(`/api/auth${endpoint}`, createEvent('POST', { body: '{}' }))

      await expect(getCachedAuthToken('session-A')).resolves.toBeNull()
      await expect(getCachedAuthToken('session-B')).resolves.toBe('jwt-for-B')
      await expect(getCachedAuthToken('session-C')).resolves.toBe('jwt-for-C')
    },
  )

  it('allows an exchange started before sign-out to repopulate the cleared session key', async () => {
    const mintedJwt = jwt({
      sub: 'user-1',
      email: 'owner@example.com',
      exp: Math.floor(Date.now() / 1000) + 900,
    })
    let markFetchStarted!: () => void
    let resolveFetch!: (response: Response) => void
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve
    })
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        markFetchStarted()
        return pendingFetch
      }),
    )

    const snapshotPromise = resolveServerAuthSnapshot({
      siteUrl: 'https://demo.convex.site',
      cookieHeader: 'better-auth.session_token=session-A',
      authCache: { enabled: true, ttl: 60 },
      requestId: 'in-flight-cache-experiment',
      trackWaterfall: false,
      throwOnMisconfig: true,
      revealAuthErrorDetails: true,
    })
    await fetchStarted

    await invokeProxy('/api/auth/sign-out', createEvent('POST'))
    await expect(getCachedAuthToken('session-A')).resolves.toBeNull()

    resolveFetch(
      new Response(JSON.stringify({ token: mintedJwt }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(snapshotPromise).resolves.toMatchObject({ token: mintedJwt })
    await expect(getCachedAuthToken('session-A')).resolves.toBe(mintedJwt)
  })
})

describe('siteUrl and base-path boundaries', () => {
  it('strictly rejects a raw path/cleartext siteUrl in token exchange but preserves it elsewhere', async () => {
    const rawSiteUrl = 'http://internal.example/private-prefix'

    expect(() => normalizeSiteUrl(rawSiteUrl)).toThrow(/non-root path|loopback/i)
    expect(
      normalizeConvexRuntimeConfig({
        url: 'https://demo.convex.cloud',
        siteUrl: rawSiteUrl,
        auth: { cache: { ttl: 60 } },
      }).siteUrl,
    ).toBe(rawSiteUrl)

    getConvexRuntimeConfigMock.mockReturnValue(runtimeConfig({ siteUrl: rawSiteUrl }))
    await invokeProxy('/api/auth/get-session', createEvent('GET'))

    expect(fetchWithCanonicalRedirectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'http://internal.example/private-prefix/api/auth/get-session',
        headers: expect.objectContaining({ cookie: 'better-auth.session_token=session-A' }),
      }),
    )
  })

  it('keeps the Nuxt proxy route separate from the upstream basePath supported by the adapter', async () => {
    const outboundUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        outboundUrls.push(input instanceof Request ? input.url : String(input))
        return new Response(JSON.stringify({ token: 'official.jwt' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    await getOfficialConvexToken(
      'https://demo.convex.site',
      new Headers({ cookie: 'better-auth.session_token=session-A' }),
      { basePath: '/custom/auth' },
    )
    expect(outboundUrls).toEqual(['https://demo.convex.site/custom/auth/convex/token'])

    getConvexRuntimeConfigMock.mockReturnValue(runtimeConfig({ route: '/custom/auth' }))
    await invokeProxy('/custom/auth/convex/token', createEvent('GET'))

    expect(fetchWithCanonicalRedirectsMock).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'https://demo.convex.site/api/auth/convex/token' }),
    )
  })
})
