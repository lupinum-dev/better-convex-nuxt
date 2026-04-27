import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearServerJwksCache } from '../../src/runtime/auth/server/verified-jwt'
import { decodeUserFromJwt } from '../../src/runtime/convex/shared/convex-shared'
import {
  backingStore,
  createEvent,
  installServerAuthStorageMock,
  mockConvexConfig,
  resetServerAuthFixtureState,
  storageSetCalls,
  useEventMock,
  useRuntimeConfigMock,
  useStorageMock,
} from '../support/auth/server-auth-fixtures'
import { createServerJwksResponse, mintServerJwt } from '../support/auth/server-jwt'

vi.mock('nitropack/runtime', () => ({
  useStorage: useStorageMock,
  useRuntimeConfig: useRuntimeConfigMock,
  useEvent: useEventMock,
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: useRuntimeConfigMock,
}))

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function makeUnsignedJwt(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = toBase64Url(JSON.stringify(payload))
  return `${header}.${body}.signature`
}

describe('server SSR auth cache', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetServerAuthFixtureState()
    clearServerJwksCache()

    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: mockConvexConfig(),
      },
    })
    useEventMock.mockImplementation(() => {
      throw new Error('Nitro request context is not available')
    })
    installServerAuthStorageMock()
  })

  it('stores cached auth tokens under a hashed session key and reads them back', async () => {
    const { setCachedAuthToken, getCachedAuthToken } =
      await import('../../src/runtime/auth/server/auth-cache')

    await setCachedAuthToken('session-abc', 'jwt-for-abc', 60)

    expect(Array.from(backingStore.keys())).toHaveLength(1)
    expect(Array.from(backingStore.keys())[0]).not.toContain('session-abc')
    expect(storageSetCalls.at(-1)).toEqual(
      expect.objectContaining({ ttl: 60, value: 'jwt-for-abc' }),
    )
    expect(await getCachedAuthToken('session-abc')).toBe('jwt-for-abc')
  })

  it('clears only the targeted cached auth token', async () => {
    const { setCachedAuthToken, getCachedAuthToken, serverConvexClearAuthCache } =
      await import('../../src/runtime/auth/server/auth-cache')

    await setCachedAuthToken('session-a', 'jwt-a', 60)
    await setCachedAuthToken('session-b', 'jwt-b', 60)

    await serverConvexClearAuthCache('session-a')

    expect(await getCachedAuthToken('session-a')).toBeNull()
    expect(await getCachedAuthToken('session-b')).toBe('jwt-b')
  })

  it('resolver cache hits avoid a fresh token exchange and still decode the user from the cached JWT', async () => {
    const { setCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')
    const { resolveRequestAuth } = await import('../../src/runtime/auth/server/auth-resolver')

    const token = await mintServerJwt({ sub: 'user-cached', name: 'Alice' })
    await setCachedAuthToken('session-cached', token, 60)

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/get-session')) {
        return new Response(JSON.stringify({ session: { id: 'session-cached' } }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveRequestAuth(
      createEvent('better-auth.session_token=session-cached') as never,
      mockConvexConfig(),
    )

    expect(resolved.cacheHit).toBe(true)
    expect(resolved.source).toBe('cache')
    expect(resolved.token).toBe(token)
    expect(resolved.user).toEqual(decodeUserFromJwt(token))
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/auth/convex/token')),
    ).toHaveLength(0)
  })

  it('resolver caches exchanged tokens with the configured TTL', async () => {
    const { resolveRequestAuth } = await import('../../src/runtime/auth/server/auth-resolver')
    const freshToken = await mintServerJwt({ sub: 'user-ttl', name: 'Fresh TTL User' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: freshToken }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveRequestAuth(
      createEvent('better-auth.session_token=session-ttl'),
      mockConvexConfig({
        auth: {
          enabled: true,
          route: '/api/auth',
          trustedOrigins: [],
          skipAuthTokenFetchRoutes: [],
          cache: {
            enabled: true,
            ttl: 17,
          },
          proxy: {
            maxRequestBodyBytes: 1_048_576,
            maxResponseBodyBytes: 1_048_576,
          },
        },
      }),
    )

    expect(resolved.source).toBe('exchange')
    expect(storageSetCalls.at(-1)).toEqual(expect.objectContaining({ ttl: 17, value: freshToken }))
  })

  it('does not cache exchanged tokens when secure and non-secure session cookies disagree', async () => {
    const { resolveRequestAuth } = await import('../../src/runtime/auth/server/auth-resolver')
    const secureCookieToken = await mintServerJwt({
      sub: 'secure-cookie-user',
      name: 'Secure Cookie User',
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: secureCookieToken }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveRequestAuth(
      createEvent(
        'better-auth.session_token=plain-cookie-user; __Secure-better-auth.session_token=secure-cookie-user',
      ),
      mockConvexConfig(),
    )

    expect(resolved.source).toBe('exchange')
    expect(resolved.token).toBe(secureCookieToken)
    expect(storageSetCalls).toHaveLength(0)
  })

  it('does not expose upstream auth response bodies in resolver errors', async () => {
    const { resolveRequestAuth } = await import('../../src/runtime/auth/server/auth-resolver')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response('super-secret-upstream-body', { status: 500 })
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveRequestAuth(
      createEvent('better-auth.session_token=session-secret'),
      mockConvexConfig({
        auth: {
          cache: {
            enabled: false,
            ttl: 60,
          },
        },
      }),
    )

    expect(resolved.error).toMatch(/Token exchange failed/)
    expect(resolved.error).not.toContain('super-secret-upstream-body')
  })

  it('resolver cache can be disabled without changing raw cache utility behavior', async () => {
    const { setCachedAuthToken, getCachedAuthToken } =
      await import('../../src/runtime/auth/server/auth-cache')
    await setCachedAuthToken('session-disabled', 'jwt-disabled', 60)

    expect(await getCachedAuthToken('session-disabled')).toBe('jwt-disabled')

    const { resolveRequestAuth } = await import('../../src/runtime/auth/server/auth-resolver')
    const freshToken = await mintServerJwt({ sub: 'user-disabled', name: 'Fresh User' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: freshToken }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveRequestAuth(
      createEvent('better-auth.session_token=session-disabled') as never,
      mockConvexConfig({
        auth: {
          enabled: true,
          route: '/api/auth',
          trustedOrigins: [],
          skipAuthTokenFetchRoutes: [],
          cache: {
            enabled: false,
            ttl: 60,
          },
          proxy: {
            maxRequestBodyBytes: 1_048_576,
            maxResponseBodyBytes: 1_048_576,
          },
        },
      }),
    )

    expect(resolved.cacheHit).toBe(false)
    expect(resolved.source).toBe('exchange')
    expect(resolved.token).toBe(freshToken)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not authenticate cache-hit JWTs that were never cryptographically verified', async () => {
    const { setCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')
    const { resolveRequestAuth } = await import('../../src/runtime/auth/server/auth-resolver')

    const unsignedJwt = makeUnsignedJwt({
      sub: 'user-forged',
      name: 'Mallory',
      email: 'mallory@example.com',
    })

    await setCachedAuthToken('session-forged', unsignedJwt, 60)

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/get-session')) {
        return new Response(JSON.stringify({ session: { id: 'session-forged' } }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveRequestAuth(
      createEvent('better-auth.session_token=session-forged') as never,
      mockConvexConfig(),
    )

    expect(resolved.cacheHit).toBe(true)
    expect(resolved.token).toBeNull()
    expect(resolved.user).toBeNull()
    expect(resolved.error).toMatch(/invalid|verify|signature/i)
  })

  it('revalidates cached sessions when the upstream auth endpoint rejects them', async () => {
    const { setCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')
    const { resolveRequestAuth } = await import('../../src/runtime/auth/server/auth-resolver')

    const cachedJwt = await mintServerJwt({
      sub: 'user-revoked',
      name: 'Revoked User',
      email: 'revoked@example.com',
    })

    await setCachedAuthToken('session-revoked', cachedJwt, 60)

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/get-session')) {
        return new Response('revoked', { status: 403 })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveRequestAuth(
      createEvent('better-auth.session_token=session-revoked') as never,
      mockConvexConfig(),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resolved.token).toBeNull()
    expect(resolved.user).toBeNull()
    expect(resolved.isSessionRejected).toBe(true)
  })
})
