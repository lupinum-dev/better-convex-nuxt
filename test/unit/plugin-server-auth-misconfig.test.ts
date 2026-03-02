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
  defineNuxtPluginMock: vi.fn((fn: unknown) => fn),
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

vi.mock('../../src/runtime/utils/runtime-config', () => ({
  getConvexRuntimeConfig: getConvexRuntimeConfigMock,
}))

vi.mock('../../src/runtime/server/utils/http', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}))

vi.mock('../../src/runtime/server/utils/auth-cache', () => ({
  getCachedAuthToken: getCachedAuthTokenMock,
  setCachedAuthToken: setCachedAuthTokenMock,
}))

vi.mock('../../src/runtime/utils/convex-shared', () => ({
  decodeUserFromJwt: decodeUserFromJwtMock,
}))

type MockResponse = {
  status: number
  ok: boolean
  json: () => Promise<unknown>
}

function createResponse(status: number, body: unknown): MockResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }
}

describe('plugin.server token exchange failure policy', () => {
  const stateStore = new Map<string, { value: unknown }>()

  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    delete (globalThis as typeof globalThis & { __BCN_AUTH_HEALTHCHECK_DONE__?: Set<string> }).__BCN_AUTH_HEALTHCHECK_DONE__

    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: { logging: false, debug: {} },
      },
    })

    useRequestEventMock.mockReturnValue({
      path: '/dashboard',
      method: 'GET',
      node: { req: { url: '/dashboard' } },
      headers: new Headers({
        cookie: 'better-auth.session_token=abc',
      }),
    })

    useStateMock.mockImplementation((key: string, init?: (() => unknown) | unknown) => {
      if (!stateStore.has(key)) {
        const value = typeof init === 'function' ? (init as () => unknown)() : init ?? null
        stateStore.set(key, { value })
      }
      return stateStore.get(key)
    })

    getConvexRuntimeConfigMock.mockReturnValue({
      url: 'https://demo.convex.cloud',
      siteUrl: 'https://demo.convex.site',
      auth: { enabled: true },
      authCache: { enabled: false, ttl: 900 },
    })

    getCachedAuthTokenMock.mockResolvedValue(null)
    setCachedAuthTokenMock.mockResolvedValue(undefined)
    decodeUserFromJwtMock.mockReturnValue(null)
  })

  it('treats 500 token exchange as misconfig (dev throw, always sets auth error)', async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/get-session')) {
        return createResponse(200, { user: null })
      }
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(500, {})
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const plugin = (await import('../../src/runtime/plugin.server')).default as () => Promise<void>
    const run = plugin()

    if (import.meta.dev) {
      await expect(run).rejects.toThrow(/token exchange/i)
    } else {
      await expect(run).resolves.toBeUndefined()
    }

    expect(String(stateStore.get('convex:authError')?.value ?? '')).toMatch(/convex\/token|token exchange/i)
  })

  it('keeps 401 token exchange as graceful unauthenticated (no throw)', async () => {
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/get-session')) {
        return createResponse(200, { user: null })
      }
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(401, { error: 'unauthorized' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const plugin = (await import('../../src/runtime/plugin.server')).default as () => Promise<void>
    await expect(plugin()).resolves.toBeUndefined()

    expect(stateStore.get('convex:authError')?.value).toBeNull()
    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(stateStore.get('convex:user')?.value).toBeNull()
  })
})
