import { beforeEach, describe, expect, it, vi } from 'vitest'

const stateStore = new Map<string, { value: unknown }>()

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function makeJwt(payload: Record<string, unknown>): string {
  return [
    toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    toBase64Url(JSON.stringify(payload)),
    'test-signature',
  ].join('.')
}

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
    tokenMock.mockResolvedValue({
      data: { token: makeJwt({ sub: 'u1', email: 'alice@test.com' }) },
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

    expect(token).toBe(makeJwt({ sub: 'u1', email: 'alice@test.com' }))
    expect(tokenMock).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retries immediately after a signed-out miss and can pick up a fresh login', async () => {
    tokenMock
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: { token: makeJwt({ sub: 'u2', email: 'bob@test.com' }) },
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
    expect(second).toBe(makeJwt({ sub: 'u2', email: 'bob@test.com' }))
    expect(tokenMock).toHaveBeenCalledTimes(2)
    expect(stateStore.get('convex:authError')?.value).toBeNull()
    expect(stateStore.get('convex:token')?.value).toBe(
      makeJwt({ sub: 'u2', email: 'bob@test.com' }),
    )
    expect(fetch).not.toHaveBeenCalled()
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
})
