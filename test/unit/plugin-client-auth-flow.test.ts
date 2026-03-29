import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TOKEN_CACHE_MS,
  TOKEN_EXPIRY_SAFETY_BUFFER_MS,
} from '../../src/runtime/utils/constants'
import {
  mintJwt,
  mintJwtExpiringIn,
} from '../harness/jwt-factory'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

const stateStore = new Map<string, { value: unknown }>()

const {
  defineNuxtPluginMock,
  useRuntimeConfigMock,
  useStateMock,
  useRouterMock,
  getConvexRuntimeConfigMock,
  createAuthClientMock,
  tokenMock,
  authLogMock,
  debugLogMock,
  clientState,
  MockConvexClient,
  hookRegistry,
} = vi.hoisted(() => {
  const clientState = {
    fetchToken: null as null | ((input: { forceRefreshToken: boolean }) => Promise<string | null>),
  }
  const hookRegistry = new Map<string, (...args: unknown[]) => unknown>()

  class MockConvexClient {
    setAuth(
      fetchToken: (input: { forceRefreshToken: boolean }) => Promise<string | null>,
      onChange?: (isAuthenticated: boolean) => void,
    ) {
      clientState.fetchToken = fetchToken
      onChange?.(false)
    }
  }

  return {
    defineNuxtPluginMock: vi.fn((fn: unknown) => fn),
    useRuntimeConfigMock: vi.fn(),
    useStateMock: vi.fn(),
    useRouterMock: vi.fn(),
    getConvexRuntimeConfigMock: vi.fn(),
    createAuthClientMock: vi.fn(),
    tokenMock: vi.fn(),
    authLogMock: vi.fn(),
    debugLogMock: vi.fn(),
    clientState,
    MockConvexClient,
    hookRegistry,
  }
})

vi.mock('#app', () => ({
  defineNuxtPlugin: defineNuxtPluginMock,
  useRuntimeConfig: useRuntimeConfigMock,
  useState: useStateMock,
  useRouter: useRouterMock,
}))

vi.mock('@convex-dev/better-auth/client/plugins', () => ({
  convexClient: () => ({}),
}))

vi.mock('better-auth/vue', () => ({
  createAuthClient: createAuthClientMock,
}))

vi.mock('convex/browser', () => {
  return { ConvexClient: MockConvexClient }
})

vi.mock('../../src/runtime/utils/runtime-config', () => ({
  getConvexRuntimeConfig: getConvexRuntimeConfigMock,
}))

vi.mock('../../src/runtime/utils/logger', () => ({
  createLogger: () => ({
    auth: authLogMock,
    debug: debugLogMock,
    time: () => vi.fn(),
  }),
  getLogLevel: () => 'silent',
}))

describe('plugin.client auth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    stateStore.clear()
    clientState.fetchToken = null
    hookRegistry.clear()

    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: {
          logging: false,
          debug: {},
        },
      },
    })

    useStateMock.mockImplementation((key: string, init?: (() => unknown) | unknown) => {
      if (!stateStore.has(key)) {
        const value =
          typeof init === 'function' ? (init as () => unknown)() : init === undefined ? null : init
        stateStore.set(key, { value })
      }
      return stateStore.get(key)
    })

    useRouterMock.mockReturnValue({
      currentRoute: {
        value: {
          path: '/dashboard',
          meta: {},
        },
      },
    })

    getConvexRuntimeConfigMock.mockReturnValue({
      url: 'https://demo.convex.cloud',
      siteUrl: 'https://demo.convex.site',
      auth: { enabled: true, route: '/api/auth', skipAuthRoutes: [] },
    })

    createAuthClientMock.mockReturnValue({
      convex: {
        token: tokenMock,
      },
    })
  })

  it('uses only the token exchange request on client cold boot', async () => {
    const exchangedToken = mintJwt({ sub: 'u1', email: 'alice@test.com' })
    tokenMock.mockResolvedValue({
      data: { token: exchangedToken },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: false },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    expect(fetchToken).toBeTypeOf('function')

    const token = await fetchToken!({ forceRefreshToken: false })

    expect(token).toBe(exchangedToken)
    expect(tokenMock).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retries immediately after a signed-out miss and can pick up a fresh login', async () => {
    const freshToken = mintJwt({ sub: 'u2', email: 'bob@test.com' })
    tokenMock
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: { token: freshToken },
        error: null,
      })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: false },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    expect(fetchToken).toBeTypeOf('function')

    const first = await fetchToken!({ forceRefreshToken: false })
    const second = await fetchToken!({ forceRefreshToken: false })

    expect(first).toBeNull()
    expect(second).toBe(freshToken)
    expect(tokenMock).toHaveBeenCalledTimes(2)
    expect(stateStore.get('convex:authError')?.value).toBeNull()
    expect(stateStore.get('convex:token')?.value).toBe(freshToken)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('hydrates a missing user directly from a valid SSR token without exchanging again', async () => {
    const hydratedToken = mintJwt({ sub: 'u-hydrated', email: 'hydrated@test.com' })
    stateStore.set('convex:token', { value: hydratedToken })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: true },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    const token = await fetchToken!({ forceRefreshToken: false })

    expect(token).toBe(hydratedToken)
    expect(tokenMock).not.toHaveBeenCalled()
    expect(stateStore.get('convex:user')?.value).toEqual(
      expect.objectContaining({ id: 'u-hydrated', email: 'hydrated@test.com' }),
    )
    expect(stateStore.get('convex:authError')?.value).toBeNull()
  })

  it('fails closed and logs when a hydrated SSR token cannot be decoded', async () => {
    stateStore.set('convex:token', { value: 'not-a-valid.jwt' })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: true },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    await expect(fetchToken!({ forceRefreshToken: false })).resolves.toBeNull()

    expect(tokenMock).not.toHaveBeenCalled()
    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(stateStore.get('convex:user')?.value).toBeNull()
    expect(String(stateStore.get('convex:authError')?.value ?? '')).toMatch(/invalid auth token/i)
    expect(authLogMock).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'client-fetchToken:cache',
      outcome: 'error',
      details: expect.objectContaining({
        source: 'hydrated-token',
      }),
    }))
  })

  it('reuses the recent token cache without another exchange and can decode the user again', async () => {
    const hydratedToken = mintJwt({ sub: 'u-cache', email: 'cache@test.com' })
    stateStore.set('convex:token', { value: hydratedToken })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: true },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    await fetchToken!({ forceRefreshToken: false })

    stateStore.get('convex:user')!.value = null

    await expect(fetchToken!({ forceRefreshToken: true })).resolves.toBe(hydratedToken)
    expect(tokenMock).not.toHaveBeenCalled()
    expect(stateStore.get('convex:user')?.value).toEqual(
      expect.objectContaining({ id: 'u-cache', email: 'cache@test.com' }),
    )
  })

  it('fails closed and logs when the recent token cache holds a token that can no longer be decoded', async () => {
    const hydratedToken = mintJwt({ sub: 'u-cache-bad', email: 'cache-bad@test.com' })
    stateStore.set('convex:token', { value: hydratedToken })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: true },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    await fetchToken!({ forceRefreshToken: false })

    stateStore.get('convex:token')!.value = 'not-a-valid.jwt'
    stateStore.get('convex:user')!.value = null

    await expect(fetchToken!({ forceRefreshToken: true })).resolves.toBeNull()
    expect(tokenMock).not.toHaveBeenCalled()
    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(authLogMock).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'client-fetchToken:cache',
      outcome: 'error',
      details: expect.objectContaining({
        source: 'recent-token-cache',
      }),
    }))
  })

  it('forces a fresh exchange after the recent token cache window expires', async () => {
    vi.useFakeTimers()
    const hydratedToken = mintJwt({ sub: 'u-window', email: 'window@test.com' })
    const freshToken = mintJwt({ sub: 'u-window-fresh', email: 'fresh@test.com' })
    stateStore.set('convex:token', { value: hydratedToken })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    tokenMock.mockResolvedValue({ data: { token: freshToken }, error: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: true },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    await fetchToken!({ forceRefreshToken: false })

    vi.advanceTimersByTime(TOKEN_CACHE_MS + 1)

    await expect(fetchToken!({ forceRefreshToken: true })).resolves.toBe(freshToken)
    expect(tokenMock).toHaveBeenCalledTimes(1)
  })

  it('forces a fresh exchange when the cached token is inside the expiry safety buffer', async () => {
    const nearlyExpiredToken = mintJwtExpiringIn(
      { sub: 'u-expiring', email: 'expiring@test.com' },
      TOKEN_EXPIRY_SAFETY_BUFFER_MS - 1_000,
    )
    const freshToken = mintJwt({ sub: 'u-expiring-fresh', email: 'fresh@test.com' })
    stateStore.set('convex:token', { value: nearlyExpiredToken })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    tokenMock.mockResolvedValue({ data: { token: freshToken }, error: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: true },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    await fetchToken!({ forceRefreshToken: false })

    await expect(fetchToken!({ forceRefreshToken: true })).resolves.toBe(freshToken)
    expect(tokenMock).toHaveBeenCalledTimes(1)
  })

  it('keeps a replacement forced in-flight request alive when an older non-forced request settles', async () => {
    const replacementToken = mintJwt({ sub: 'u-replacement', email: 'replacement@test.com' })
    const fallbackToken = mintJwt({ sub: 'u-fallback', email: 'fallback@test.com' })
    const firstResponse = createDeferred<{ data: null, error: null }>()
    const secondResponse = createDeferred<{ data: { token: string }, error: null }>()

    tokenMock
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise)
      .mockResolvedValueOnce({ data: { token: fallbackToken }, error: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: false },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    expect(fetchToken).toBeTypeOf('function')

    const first = fetchToken!({ forceRefreshToken: false })
    const second = fetchToken!({ forceRefreshToken: true })

    firstResponse.resolve({ data: null, error: null })
    await Promise.resolve()

    const third = fetchToken!({ forceRefreshToken: false })

    secondResponse.resolve({ data: { token: replacementToken }, error: null })

    await expect(first).resolves.toBeNull()
    await expect(second).resolves.toBe(replacementToken)
    await expect(third).resolves.toBe(replacementToken)
    expect(tokenMock).toHaveBeenCalledTimes(2)
  })

  it('invalidates the live auth transport and clears local auth state', async () => {
    tokenMock.mockResolvedValue({
      data: { token: 'jwt-from-token-exchange' },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: false },
      hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        hookRegistry.set(event, handler)
      }),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    expect(fetchToken).toBeTypeOf('function')

    await fetchToken!({ forceRefreshToken: false })
    stateStore.get('convex:user')!.value = { id: 'u1' }
    stateStore.get('convex:authError')!.value = 'stale error'

    const invalidate = hookRegistry.get('better-convex:auth:invalidate')
    expect(invalidate).toBeTypeOf('function')

    await invalidate?.()

    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(stateStore.get('convex:user')?.value).toBeNull()
    expect(stateStore.get('convex:authError')?.value).toBeNull()
    await expect(clientState.fetchToken?.({ forceRefreshToken: false }) ?? Promise.resolve(null)).resolves.toBeNull()
  })

  describe('normalizeHydratedUser edge cases', () => {
    async function initPluginWithHydratedUser(hydratedToken: string, hydratedUser: unknown) {
      stateStore.set('convex:token', { value: hydratedToken })
      stateStore.set('convex:user', { value: hydratedUser })

      const plugin = (await import('../../src/runtime/plugin.client')).default
      await plugin({
        payload: { serverRendered: true },
        hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
          hookRegistry.set(event, handler)
        }),
        provide: vi.fn(),
      } as never)
    }

    it('rejects a truthy object without a string id and decodes user from JWT', async () => {
      const hydratedToken = mintJwt({ sub: 'u-edge', email: 'edge@test.com' })
      await initPluginWithHydratedUser(hydratedToken, { name: 'No ID' })

      const result = await clientState.fetchToken?.({ forceRefreshToken: false })
      expect(result).toBe(hydratedToken)
      expect(stateStore.get('convex:user')?.value).toMatchObject({ id: 'u-edge' })
    })

    it('rejects a user with a non-string id', async () => {
      const hydratedToken = mintJwt({ sub: 'u-num', email: 'num@test.com' })
      await initPluginWithHydratedUser(hydratedToken, { id: 42 })

      const result = await clientState.fetchToken?.({ forceRefreshToken: false })
      expect(result).toBe(hydratedToken)
      expect(stateStore.get('convex:user')?.value).toMatchObject({ id: 'u-num' })
    })

    it('rejects an array as not a valid user', async () => {
      const hydratedToken = mintJwt({ sub: 'u-arr', email: 'arr@test.com' })
      await initPluginWithHydratedUser(hydratedToken, ['not', 'a', 'user'])

      const result = await clientState.fetchToken?.({ forceRefreshToken: false })
      expect(result).toBe(hydratedToken)
      expect(stateStore.get('convex:user')?.value).toMatchObject({ id: 'u-arr' })
    })

    it('rejects a string primitive as not a valid user', async () => {
      const hydratedToken = mintJwt({ sub: 'u-str', email: 'str@test.com' })
      await initPluginWithHydratedUser(hydratedToken, 'just-a-string')

      const result = await clientState.fetchToken?.({ forceRefreshToken: false })
      expect(result).toBe(hydratedToken)
      expect(stateStore.get('convex:user')?.value).toMatchObject({ id: 'u-str' })
    })
  })
})
