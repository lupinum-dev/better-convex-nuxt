import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  serverConvexMutation,
  serverConvexQuery,
} from '../../src/runtime/server/utils/convex'
import {
  resolveRequestAuth,
  resolveRequestAuthToken,
} from '../../src/runtime/server/utils/auth-resolver'
import {
  decodeUserFromJwt,
  getJwtTimeUntilExpiryMs,
} from '../../src/runtime/utils/convex-shared'
import {
  createEvent,
  installServerAuthStorageMock,
  mockConvexConfig,
  resetServerAuthFixtureState,
} from '../harness/server-auth-fixtures'

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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: 'auto.jwt.token' }), {
          headers: { 'content-type': 'application/json' },
        })
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

    const exchangeCalls = fetchMock.mock.calls.filter(call =>
      String(call[0]).endsWith('/api/auth/convex/token'),
    )
    expect(exchangeCalls).toHaveLength(1)

    const queryCall = fetchMock.mock.calls.find(call =>
      String(call[0]).endsWith('/api/query'),
    )
    expect(queryCall).toBeDefined()
    if (!queryCall) {
      throw new Error('Expected query fetch call')
    }
    const headers = ((queryCall[1] ?? {}) as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer auto.jwt.token')
  })

  it('auth:auto skips token exchange when no Better Auth cookie exists', async () => {
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ value: [] }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(
      createEvent(),
      { _path: 'notes:list' } as never,
      {} as never,
      { auth: 'auto' },
    )

    expect(fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/api/auth/convex/token'))).toHaveLength(0)
    const queryCall = fetchMock.mock.calls.find(call =>
      String(call[0]).endsWith('/api/query'),
    )
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
      serverConvexQuery(
        createEvent(),
        { _path: 'notes:list' } as never,
        {} as never,
        { auth: 'required' },
      ),
    ).rejects.toThrow('[serverConvex] Authentication required but no Better Auth session cookie was found')
  })

  it('auth:none never exchanges the cookie and never forwards a bearer token', async () => {
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
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

    expect(fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/api/auth/convex/token'))).toHaveLength(0)
    const mutationCall = fetchMock.mock.calls.find(call =>
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: 'shared.jwt.token' }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ value: { ok: true } }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const event = createEvent('better-auth.session_token=session-123')

    await Promise.all([
      serverConvexQuery(
        event,
        { _path: 'notes:list' } as never,
        {} as never,
        { auth: 'auto' },
      ),
      serverConvexMutation(
        event,
        { _path: 'notes:add' } as never,
        { title: 'Shared' } as never,
        { auth: 'auto' },
      ),
    ])

    expect(fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/api/auth/convex/token'))).toHaveLength(1)
  })

  it('resolveRequestAuth caches a validated token in the request context and returns the same resolved object', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: 'cached.jwt.token' }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected fetch target: ${String(input)}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const event = createEvent('better-auth.session_token=session-123')
    const config = mockConvexConfig()

    const first = await resolveRequestAuth(event, config)
    const second = await resolveRequestAuth(event, config)

    expect(first).toBe(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.token).toBe('cached.jwt.token')
    expect(first.user).toEqual(decodeUserFromJwt('cached.jwt.token'))
  })

  it('treats cache as disabled at the resolver level when auth.cache.enabled is false', async () => {
    vi.resetModules()
    const getCachedAuthTokenSpy = vi.fn()
    const setCachedAuthTokenSpy = vi.fn()
    vi.doMock('../../src/runtime/server/utils/auth-cache', () => ({
      getCachedAuthToken: getCachedAuthTokenSpy,
      setCachedAuthToken: setCachedAuthTokenSpy,
      serverConvexClearAuthCache: vi.fn(),
    }))

    const { resolveRequestAuth: resolveRequestAuthWithMocks } = await import('../../src/runtime/server/utils/auth-resolver')

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: 'uncached.jwt.token' }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected fetch target: ${String(input)}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const event = createEvent('better-auth.session_token=session-123')
    const config = mockConvexConfig({
      auth: {
        enabled: true,
        route: '/api/auth',
        trustedOrigins: [],
        skipAuthRoutes: [],
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
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns a concrete error when auth is required but the token exchange yields no token', async () => {
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
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
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
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
    const token = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjQ3OTk5OTk5OTl9.test'
    const remaining = getJwtTimeUntilExpiryMs(token, 1_700_000_000_000)
    expect(remaining).not.toBeNull()
    expect(remaining).toBeGreaterThan(0)
  })
})
