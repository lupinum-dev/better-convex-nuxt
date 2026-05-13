import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resolveRequestAuth,
  resolveRequestAuthToken,
} from '../../src/runtime/auth/server/auth-resolver'
import { clearServerJwksCache } from '../../src/runtime/auth/server/verified-jwt'
import { serverConvexMutation, serverConvexQuery } from '../../src/runtime/convex/server/convex'
import {
  decodeUserFromJwt,
  getJwtTimeUntilExpiryMs,
} from '../../src/runtime/convex/shared/convex-shared'
import {
  createEvent,
  installServerAuthStorageMock,
  mockConvexConfig,
  resetServerAuthFixtureState,
} from '../support/auth/server-auth-fixtures'
import { createServerJwksResponse, mintServerJwt } from '../support/auth/server-jwt'

const { useStorageMock } = vi.hoisted(() => ({
  useStorageMock: vi.fn(),
}))

const { useRuntimeConfigMock, useEventMock } = vi.hoisted(() => ({
  useRuntimeConfigMock: vi.fn(),
  useEventMock: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  useStorage: useStorageMock,
  useRuntimeConfig: useRuntimeConfigMock,
  useEvent: useEventMock,
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: useRuntimeConfigMock,
}))

describe('server auth helpers', () => {
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
    installServerAuthStorageMock(useStorageMock)
  })

  it('auth:auto exchanges the Better Auth session cookie for a Convex bearer token', async () => {
    const token = await mintServerJwt({ sub: 'user-auto', name: 'Auto User' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      return new Response(JSON.stringify({ value: { ok: true } }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(
      createEvent('better-auth.session_token=session-123'),
      { _path: 'notes:list' } as never,
      {} as never,
      { auth: 'auto' },
    )

    const exchangeCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith('/api/auth/convex/token'),
    )
    expect(exchangeCalls).toHaveLength(1)

    const queryCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/api/query'))
    expect(queryCall).toBeDefined()
    if (!queryCall) {
      throw new Error('Expected query fetch call')
    }
    const headers = ((queryCall[1] ?? {}) as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${token}`)
  })

  it('auth:auto skips token exchange when no Better Auth cookie exists', async () => {
    const fetchMock = vi.fn(
      async (_input?: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ value: [] }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(createEvent(), { _path: 'notes:list' } as never, {} as never, {
      auth: 'auto',
    })

    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/auth/convex/token')),
    ).toHaveLength(0)
    const queryCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/api/query'))
    expect(queryCall).toBeDefined()
    if (!queryCall) {
      throw new Error('Expected query fetch call')
    }
    const headers = ((queryCall[1] ?? {}) as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('auth:required fails closed when the session cookie is missing', async () => {
    vi.stubGlobal('fetch', vi.fn())

    await expect(
      serverConvexQuery(createEvent(), { _path: 'notes:list' } as never, {} as never, {
        auth: 'required',
      }),
    ).rejects.toThrow(
      '[serverConvexQuery] Failed to resolve auth for notes:list (auth: required). Authentication required but no Better Auth session cookie was found',
    )
  })

  it('auth:none never exchanges the cookie and never forwards a bearer token', async () => {
    const fetchMock = vi.fn(
      async (_input?: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexMutation(
      createEvent('better-auth.session_token=session-123'),
      { _path: 'notes:add' } as never,
      { title: 'Hello' } as never,
      { auth: 'none' },
    )

    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/auth/convex/token')),
    ).toHaveLength(0)
    const mutationCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith('/api/mutation'),
    )
    expect(mutationCall).toBeDefined()
    if (!mutationCall) {
      throw new Error('Expected mutation fetch call')
    }
    const headers = ((mutationCall[1] ?? {}) as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('dedupes request-scoped auth resolution across server helpers on the same event', async () => {
    const token = await mintServerJwt({ sub: 'user-shared', name: 'Shared User' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      return new Response(JSON.stringify({ value: { ok: true } }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const event = createEvent('better-auth.session_token=session-123')

    await Promise.all([
      serverConvexQuery(event, { _path: 'notes:list' } as never, {} as never, { auth: 'auto' }),
      serverConvexMutation(event, { _path: 'notes:add' } as never, { title: 'Shared' } as never, {
        auth: 'auto',
      }),
    ])

    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/auth/convex/token')),
    ).toHaveLength(1)
  })

  it('resolveRequestAuth caches a validated token in the request context and returns the same resolved object', async () => {
    const token = await mintServerJwt({ sub: 'user-cached', name: 'Cached User' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const event = createEvent('better-auth.session_token=session-123')
    const config = mockConvexConfig()

    const first = await resolveRequestAuth(event, config)
    const second = await resolveRequestAuth(event, config)

    expect(first).toBe(second)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first.token).toBe(token)
    expect(first.user).toEqual(decodeUserFromJwt(token))
  })

  it('forwards host, proto, and client ip during SSR token exchange', async () => {
    const token = await mintServerJwt(
      { sub: 'user-forwarded', name: 'Forwarded User' },
      { issuer: 'https://demo.convex.site' },
    )
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        const headers = init?.headers as Record<string, string>
        expect(headers.Cookie).toBe('better-auth.session_token=session-123')
        expect(headers['x-forwarded-host']).toBe('demo.convex.site')
        expect(headers['x-forwarded-proto']).toBe('https')
        expect(headers['x-forwarded-for']).toBe('127.0.0.1')
        return new Response(JSON.stringify({ token }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const event = createEvent('better-auth.session_token=session-123')
    const config = mockConvexConfig({ siteUrl: 'https://demo.convex.site' })

    const resolved = await resolveRequestAuth(event, config)

    expect(resolved.token).toBe(token)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('only forwards Better Auth cookies during SSR token exchange', async () => {
    const token = await mintServerJwt({ sub: 'user-filtered', name: 'Filtered User' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        const headers = init?.headers as Record<string, string>
        expect(headers.Cookie).toBe(
          'better-auth.session_token=session-123; __Secure-better-auth.session_token=secure-456',
        )
        return new Response(JSON.stringify({ token }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const event = createEvent(
      'theme=dark; better-auth.session_token=session-123; __Secure-better-auth.session_token=secure-456',
    )
    const config = mockConvexConfig()

    const resolved = await resolveRequestAuth(event, config)

    expect(resolved.token).toBe(token)
  })

  it('treats cache as disabled at the resolver level when auth.cache.enabled is false', async () => {
    vi.resetModules()
    const getCachedAuthTokenSpy = vi.fn()
    const setCachedAuthTokenSpy = vi.fn()
    vi.doMock('../../src/runtime/auth/server/auth-cache', () => ({
      getCachedAuthToken: getCachedAuthTokenSpy,
      setCachedAuthToken: setCachedAuthTokenSpy,
      serverConvexClearAuthCache: vi.fn(),
    }))

    const { resolveRequestAuth: resolveRequestAuthWithMocks } =
      await import('../../src/runtime/auth/server/auth-resolver')

    const token = await mintServerJwt({ sub: 'user-uncached', name: 'Uncached User' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }
      throw new Error(`Unexpected fetch target: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const event = createEvent('better-auth.session_token=session-123')
    const config = mockConvexConfig({
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
    })

    const resolved = await resolveRequestAuthWithMocks(event, config)
    expect(resolved.cacheHit).toBe(false)
    expect(getCachedAuthTokenSpy).not.toHaveBeenCalled()
    expect(setCachedAuthTokenSpy).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns a concrete error when auth is required but the token exchange yields no token', async () => {
    const fetchMock = vi.fn(
      async (_input?: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      resolveRequestAuthToken(
        createEvent('better-auth.session_token=session-123'),
        mockConvexConfig(),
        { auth: 'required' },
      ),
    ).rejects.toThrow('[serverConvex] Authentication required but token exchange returned no token')
  })

  it('rejects an invalid but present session by surfacing the resolver error in required mode', async () => {
    const fetchMock = vi.fn(
      async (_input?: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ token: undefined }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      resolveRequestAuthToken(
        createEvent('better-auth.session_token=session-123'),
        mockConvexConfig(),
        { auth: 'required' },
      ),
    ).rejects.toThrow('[serverConvex] Authentication required but token exchange returned no token')
  })

  it('preserves JWT expiry math on the server-side auth path', () => {
    const token =
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjQ3OTk5OTk5OTl9.test'
    const remaining = getJwtTimeUntilExpiryMs(token, 1_700_000_000_000)
    expect(remaining).not.toBeNull()
    expect(remaining).toBeGreaterThan(0)
  })
})
