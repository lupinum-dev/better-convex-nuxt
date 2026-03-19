import { beforeEach, describe, expect, it, vi } from 'vitest'

const stateStore = new Map<string, { value: unknown }>()

const {
  defineNuxtPluginMock,
  useRuntimeConfigMock,
  useStateMock,
  useRouterMock,
  getConvexRuntimeConfigMock,
  createAuthClientMock,
  tokenMock,
  clientState,
  MockConvexClient,
} = vi.hoisted(() => {
  const clientState = {
    fetchToken: null as null | ((input: { forceRefreshToken: boolean }) => Promise<string | null>),
  }

  class MockConvexClient {
    setAuth(fetchToken: (input: { forceRefreshToken: boolean }) => Promise<string | null>) {
      clientState.fetchToken = fetchToken
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
    clientState,
    MockConvexClient,
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
    auth: vi.fn(),
    debug: vi.fn(),
    time: () => vi.fn(),
  }),
  getLogLevel: () => 'silent',
}))

describe('plugin.client auth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    clientState.fetchToken = null

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
      auth: { enabled: true },
      authRoute: '/api/auth',
      skipAuthRoutes: [],
    })

    createAuthClientMock.mockReturnValue({
      convex: {
        token: tokenMock,
      },
    })
  })

  it('uses only the token exchange request on client cold boot', async () => {
    tokenMock.mockResolvedValue({
      data: { token: 'jwt-from-token-exchange' },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: false },
      hook: vi.fn(),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    expect(fetchToken).toBeTypeOf('function')

    const token = await fetchToken!({ forceRefreshToken: false })

    expect(token).toBe('jwt-from-token-exchange')
    expect(tokenMock).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('caches signed-out misses without surfacing a user-facing auth error', async () => {
    tokenMock.mockResolvedValue({
      data: null,
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = (await import('../../src/runtime/plugin.client')).default
    await plugin({
      payload: { serverRendered: false },
      hook: vi.fn(),
      provide: vi.fn(),
    } as never)

    const fetchToken = clientState.fetchToken
    expect(fetchToken).toBeTypeOf('function')

    const first = await fetchToken!({ forceRefreshToken: false })
    const second = await fetchToken!({ forceRefreshToken: false })

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(tokenMock).toHaveBeenCalledTimes(1)
    expect(stateStore.get('convex:authError')?.value).toBeNull()
    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(stateStore.get('convex:user')?.value).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
