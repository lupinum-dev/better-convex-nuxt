import { vi } from 'vitest'
import { ref } from 'vue'

export { createDeferred } from './deferred'

export const stateStore = new Map<string, { value: unknown }>()

const pluginTestkitHoisted = vi.hoisted(() => {
  const unwrapNuxtPlugin = (plugin: unknown) => {
    if (typeof plugin === 'function') {
      return plugin
    }
    if (
      plugin &&
      typeof plugin === 'object' &&
      'setup' in plugin &&
      typeof plugin.setup === 'function'
    ) {
      return plugin.setup
    }
    return plugin
  }

  const clientState = {
    fetchToken: null as null | ((input: { forceRefreshToken: boolean }) => Promise<string | null>),
    setAuthCalls: 0,
    skipOnChangeAfterFetch: false,
  }
  const hookRegistry = new Map<string, (...args: unknown[]) => unknown>()

  class MockConvexClient {
    setAuth(
      fetchToken: (input: { forceRefreshToken: boolean }) => Promise<string | null>,
      onChange?: (isAuthenticated: boolean) => void,
    ) {
      clientState.fetchToken = fetchToken
      clientState.setAuthCalls += 1

      if (clientState.setAuthCalls === 1) {
        onChange?.(false)
        return
      }

      void fetchToken({ forceRefreshToken: true }).then(
        (token) => {
          if (!clientState.skipOnChangeAfterFetch) {
            onChange?.(Boolean(token))
          }
        },
        () => onChange?.(false),
      )
    }
  }

  return {
    defineNuxtPluginMock: vi.fn(unwrapNuxtPlugin),
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

const defineNuxtPluginMock = pluginTestkitHoisted.defineNuxtPluginMock
const useRuntimeConfigMock = pluginTestkitHoisted.useRuntimeConfigMock
const useStateMock = pluginTestkitHoisted.useStateMock
const useRouterMock = pluginTestkitHoisted.useRouterMock
const getConvexRuntimeConfigMock = pluginTestkitHoisted.getConvexRuntimeConfigMock
const createAuthClientMock = pluginTestkitHoisted.createAuthClientMock
const tokenMock = pluginTestkitHoisted.tokenMock
const authLogMock = pluginTestkitHoisted.authLogMock
const debugLogMock = pluginTestkitHoisted.debugLogMock
const clientState = pluginTestkitHoisted.clientState
const MockConvexClient = pluginTestkitHoisted.MockConvexClient
const hookRegistry = pluginTestkitHoisted.hookRegistry

export {
  authLogMock,
  clientState,
  createAuthClientMock,
  debugLogMock,
  defineNuxtPluginMock,
  getConvexRuntimeConfigMock,
  hookRegistry,
  MockConvexClient,
  tokenMock,
  useRouterMock,
  useRuntimeConfigMock,
  useStateMock,
}

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

vi.mock('../../../src/runtime/convex/shared/runtime-config', () => ({
  getConvexRuntimeConfig: getConvexRuntimeConfigMock,
}))

vi.mock('../../../src/runtime/observability/runtime-observer', () => ({
  createRuntimeObserver: () => ({
    auth: authLogMock,
    debug: debugLogMock,
    query: vi.fn(),
    mutation: vi.fn(),
    action: vi.fn(),
    connection: vi.fn(),
    upload: vi.fn(),
    time: () => vi.fn(),
    setSummary: vi.fn(),
    emitSummary: vi.fn(),
  }),
}))

export function createNuxtAppMock(options?: { serverRendered?: boolean }) {
  return {
    payload: { serverRendered: options?.serverRendered ?? false },
    hook: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      hookRegistry.set(event, handler)
      return vi.fn()
    }),
    provide: vi.fn(),
  }
}

export function resetPluginClientTestkit() {
  vi.clearAllMocks()
  vi.useRealTimers()
  stateStore.clear()
  clientState.fetchToken = null
  clientState.setAuthCalls = 0
  clientState.skipOnChangeAfterFetch = false
  hookRegistry.clear()

  useRuntimeConfigMock.mockReturnValue({
    public: {
      convex: {
        observability: {
          enabled: false,
          service: 'plugin-testkit',
          capture: { backend: false, mcp: false, browser: false },
          level: 'critical',
          sample: {},
          correlation: { header: 'x-trellis-correlation-id' },
        },
      },
    },
  })

  useStateMock.mockImplementation((key: string, init?: (() => unknown) | unknown) => {
    if (!stateStore.has(key)) {
      const value =
        typeof init === 'function' ? (init as () => unknown)() : init === undefined ? null : init
      stateStore.set(key, ref(value))
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
    auth: { enabled: true, route: '/api/auth', skipAuthTokenFetchRoutes: [] },
  })

  createAuthClientMock.mockReturnValue({
    convex: {
      token: tokenMock,
    },
  })
}

export async function loadClientPlugin() {
  return (await import('../../../src/runtime/plugin.client.ts')).default
}
