import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  defineNuxtPluginMock,
  useRuntimeConfigMock,
  useRequestEventMock,
  useStateMock,
  getConvexRuntimeConfigMock,
  fetchWithTimeoutMock,
  getCachedAuthTokenMock,
  setCachedAuthTokenMock,
  decodeUserFromJwtMock,
} = vi.hoisted(() => ({
  defineNuxtPluginMock: vi.fn((plugin: unknown) => {
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
  }),
  useRuntimeConfigMock: vi.fn(),
  useRequestEventMock: vi.fn(),
  useStateMock: vi.fn(),
  getConvexRuntimeConfigMock: vi.fn(),
  fetchWithTimeoutMock: vi.fn(),
  getCachedAuthTokenMock: vi.fn(),
  setCachedAuthTokenMock: vi.fn(),
  decodeUserFromJwtMock: vi.fn(),
}))

vi.mock('#app', () => ({
  defineNuxtPlugin: defineNuxtPluginMock,
  useRuntimeConfig: useRuntimeConfigMock,
  useRequestEvent: useRequestEventMock,
  useState: useStateMock,
}))

vi.mock('../../src/runtime/convex/shared/runtime-config', () => ({
  getConvexRuntimeConfig: getConvexRuntimeConfigMock,
}))

vi.mock('../../src/runtime/convex/server/http', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}))

vi.mock('../../src/runtime/auth/server/auth-cache', () => ({
  getCachedAuthToken: getCachedAuthTokenMock,
  setCachedAuthToken: setCachedAuthTokenMock,
}))

vi.mock('../../src/runtime/convex/shared/convex-shared', () => ({
  decodeUserFromJwt: decodeUserFromJwtMock,
}))

type MockResponse = {
  status: number
  ok: boolean
  json: () => Promise<unknown>
  text: () => Promise<string>
}

function createResponse(status: number, body: unknown): MockResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function createNuxtAppMock() {
  return {
    hook: vi.fn(() => vi.fn()),
    callHook: vi.fn(),
  }
}

describe('plugin.server token exchange failure policy', () => {
  const stateStore = new Map<string, { value: unknown }>()

  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    delete (globalThis as typeof globalThis & { __BCN_AUTH_HEALTHCHECK_DONE__?: Set<string> })
      .__BCN_AUTH_HEALTHCHECK_DONE__

    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: {},
      },
    })

    useRequestEventMock.mockReturnValue({
      path: '/dashboard',
      method: 'GET',
      node: { req: { url: '/dashboard' }, res: { setHeader: vi.fn(), getHeader: vi.fn() } },
      headers: new Headers({
        cookie: 'better-auth.session_token=abc',
      }),
    })

    useStateMock.mockImplementation((key: string, init?: (() => unknown) | unknown) => {
      if (!stateStore.has(key)) {
        const value = typeof init === 'function' ? (init as () => unknown)() : (init ?? null)
        stateStore.set(key, { value })
      }
      return stateStore.get(key)
    })

    getConvexRuntimeConfigMock.mockReturnValue({
      url: 'https://demo.convex.cloud',
      siteUrl: 'https://demo.convex.site',
      auth: {
        enabled: true,
        cache: { enabled: false, ttl: 60 },
      },
    })

    getCachedAuthTokenMock.mockResolvedValue(null)
    setCachedAuthTokenMock.mockResolvedValue(undefined)
    decodeUserFromJwtMock.mockReturnValue(null)
  })

  it('treats 500 token exchange as misconfig (dev throw, always sets auth error)', async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(500, {})
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const plugin = (await import('../../src/runtime/plugin.server.ts')).default as (
      nuxtApp: unknown,
    ) => Promise<void>
    const run = plugin(createNuxtAppMock())

    if (import.meta.dev) {
      await expect(run).rejects.toThrow(/token exchange/i)
    } else {
      await expect(run).resolves.toBeUndefined()
    }

    expect(String(stateStore.get('convex:authError')?.value ?? '')).toMatch(
      /convex\/token|token exchange/i,
    )
  })

  it('relies only on the token exchange path and does not probe get-session separately', async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(401, { error: 'unauthorized' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const plugin = (await import('../../src/runtime/plugin.server.ts')).default as (
      nuxtApp: unknown,
    ) => Promise<void>
    await expect(plugin(createNuxtAppMock())).resolves.toBeUndefined()

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://demo.convex.site/api/auth/convex/token',
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: 'better-auth.session_token=abc' }),
      }),
    )
  })

  it('classifies 401 token exchange as session-rejected with a diagnostic error', async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(401, { error: 'unauthorized' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    await import('../../src/runtime/auth/client/auth-engine')
    const plugin = (await import('../../src/runtime/plugin.server.ts')).default as (
      nuxtApp: unknown,
    ) => Promise<void>
    const nuxtApp = createNuxtAppMock()
    await expect(plugin(nuxtApp)).resolves.toBeUndefined()

    // 401 with a session cookie is now classified as a session rejection
    // rather than silently treated as unauthenticated
    const authError = stateStore.get('convex:authError')?.value
    expect(authError).toMatch(/Session cookie present but rejected/)
    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(stateStore.get('convex:user')?.value).toBeNull()
  })

  it('prefers Nitro-resolved clientAddress over raw x-forwarded-for for SSR token exchange', async () => {
    useRequestEventMock.mockReturnValue({
      path: '/dashboard',
      method: 'GET',
      context: { clientAddress: '198.51.100.7' },
      node: {
        req: { url: '/dashboard', socket: { remoteAddress: '127.0.0.1' } },
        res: { setHeader: vi.fn(), getHeader: vi.fn() },
      },
      headers: new Headers({
        cookie: 'theme=dark; better-auth.session_token=abc',
        'x-forwarded-for': '203.0.113.9',
      }),
    })
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(401, { error: 'unauthorized' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const plugin = (await import('../../src/runtime/plugin.server.ts')).default as (
      nuxtApp: unknown,
    ) => Promise<void>
    await expect(plugin(createNuxtAppMock())).resolves.toBeUndefined()

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://demo.convex.site/api/auth/convex/token',
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'better-auth.session_token=abc',
          'x-forwarded-host': 'demo.convex.site',
          'x-forwarded-proto': 'https',
          'x-forwarded-for': '198.51.100.7',
        }),
      }),
    )
  })

  it('does not forward spoofable x-forwarded-for when no trusted request address exists', async () => {
    useRequestEventMock.mockReturnValue({
      path: '/dashboard',
      method: 'GET',
      context: {},
      node: {
        req: { url: '/dashboard' },
        res: { setHeader: vi.fn(), getHeader: vi.fn() },
      },
      headers: new Headers({
        cookie: 'theme=dark; better-auth.session_token=abc',
        'x-forwarded-for': '203.0.113.9',
      }),
    })
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(401, { error: 'unauthorized' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const plugin = (await import('../../src/runtime/plugin.server.ts')).default as (
      nuxtApp: unknown,
    ) => Promise<void>
    await expect(plugin(createNuxtAppMock())).resolves.toBeUndefined()

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://demo.convex.site/api/auth/convex/token',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'x-forwarded-for': '203.0.113.9',
        }),
      }),
    )
  })

  it('marks authenticated SSR responses as private and uncacheable', async () => {
    const setHeader = vi.fn()
    const getHeader = vi.fn()
    useRequestEventMock.mockReturnValue({
      path: '/dashboard',
      method: 'GET',
      node: {
        req: { url: '/dashboard' },
        res: { setHeader, getHeader },
      },
      headers: new Headers({
        cookie: 'better-auth.session_token=abc',
      }),
    })
    decodeUserFromJwtMock.mockReturnValue({ id: 'u1', email: 'u1@example.com' })
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(200, { token: 'valid.jwt.token' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const plugin = (await import('../../src/runtime/plugin.server.ts')).default as (
      nuxtApp: unknown,
    ) => Promise<void>
    await expect(plugin(createNuxtAppMock())).resolves.toBeUndefined()

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
  })

  it('fails closed during SSR when a token exchanges successfully but cannot be decoded', async () => {
    decodeUserFromJwtMock.mockReturnValue(null)
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(200, { token: 'invalid.jwt.token' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const plugin = (await import('../../src/runtime/plugin.server.ts')).default as (
      nuxtApp: unknown,
    ) => Promise<void>
    await expect(plugin(createNuxtAppMock())).resolves.toBeUndefined()

    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(stateStore.get('convex:user')?.value).toBeNull()
    expect(String(stateStore.get('convex:authError')?.value ?? '')).toMatch(/invalid auth token/i)
  })
})
