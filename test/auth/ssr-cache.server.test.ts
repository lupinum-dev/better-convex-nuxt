import { beforeEach, describe, expect, it, vi } from 'vitest'

import { decodeUserFromJwt } from '../../src/runtime/utils/convex-shared'
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
} from '../harness/server-auth-fixtures'

vi.mock('nitropack/runtime', () => ({
  useStorage: useStorageMock,
  useRuntimeConfig: useRuntimeConfigMock,
  useEvent: useEventMock,
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: useRuntimeConfigMock,
}))

describe('server SSR auth cache', () => {
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
    installServerAuthStorageMock()
  })

  it('stores cached auth tokens under a hashed session key and reads them back', async () => {
    const { setCachedAuthToken, getCachedAuthToken } =
      await import('../../src/runtime/server/utils/auth-cache')

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
      await import('../../src/runtime/server/utils/auth-cache')

    await setCachedAuthToken('session-a', 'jwt-a', 60)
    await setCachedAuthToken('session-b', 'jwt-b', 60)

    await serverConvexClearAuthCache('session-a')

    expect(await getCachedAuthToken('session-a')).toBeNull()
    expect(await getCachedAuthToken('session-b')).toBe('jwt-b')
  })

  it('resolver cache hits avoid a fresh token exchange and still decode the user from the cached JWT', async () => {
    const { setCachedAuthToken } = await import('../../src/runtime/server/utils/auth-cache')
    const { resolveRequestAuth } = await import('../../src/runtime/server/utils/auth-resolver')

    const token = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyLWNhY2hlZCIsIm5hbWUiOiJBbGljZSJ9.test'
    await setCachedAuthToken('session-cached', token, 60)

    const fetchMock = vi.fn(async () => {
      throw new Error('resolver should have hit cache')
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
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolver caches exchanged tokens with the configured TTL', async () => {
    const { resolveRequestAuth } = await import('../../src/runtime/server/utils/auth-resolver')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: 'fresh.jwt.token' }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected fetch target: ${String(input)}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveRequestAuth(
      createEvent('better-auth.session_token=session-ttl'),
      mockConvexConfig({
        auth: {
          enabled: true,
          route: '/api/auth',
          trustedOrigins: [],
          skipAuthRoutes: [],
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
    expect(storageSetCalls.at(-1)).toEqual(
      expect.objectContaining({ ttl: 17, value: 'fresh.jwt.token' }),
    )
  })

  it('resolver cache can be disabled without changing raw cache utility behavior', async () => {
    const { setCachedAuthToken, getCachedAuthToken } = await import('../../src/runtime/server/utils/auth-cache')
    await setCachedAuthToken('session-disabled', 'jwt-disabled', 60)

    expect(await getCachedAuthToken('session-disabled')).toBe('jwt-disabled')

    const { resolveRequestAuth } = await import('../../src/runtime/server/utils/auth-resolver')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: 'fresh.jwt.token' }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected fetch target: ${String(input)}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveRequestAuth(
      createEvent('better-auth.session_token=session-disabled') as never,
      mockConvexConfig({
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
      }),
    )

    expect(resolved.cacheHit).toBe(false)
    expect(resolved.source).toBe('exchange')
    expect(resolved.token).toBe('fresh.jwt.token')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
