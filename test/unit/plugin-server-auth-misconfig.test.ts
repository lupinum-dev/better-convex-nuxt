import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  defineNuxtPluginMock,
  useRuntimeConfigMock,
  useRequestEventMock,
  useStateMock,
  getConvexRuntimeConfigMock,
  fetchWithTimeoutMock,
  decodeUserFromJwtMock,
} = vi.hoisted(() => ({
  defineNuxtPluginMock: vi.fn((fn: unknown) => fn),
  useRuntimeConfigMock: vi.fn(),
  useRequestEventMock: vi.fn(),
  useStateMock: vi.fn(),
  getConvexRuntimeConfigMock: vi.fn(),
  fetchWithTimeoutMock: vi.fn(),
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
  const setHeaderMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    delete (globalThis as typeof globalThis & { __BCN_AUTH_HEALTHCHECK_DONE__?: Set<string> })
      .__BCN_AUTH_HEALTHCHECK_DONE__

    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: { logging: false, debug: {} },
      },
    })

    useRequestEventMock.mockReturnValue({
      path: '/dashboard',
      method: 'GET',
      node: {
        req: { url: '/dashboard' },
        res: { setHeader: setHeaderMock, getHeader: vi.fn().mockReturnValue(undefined) },
      },
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
        proxy: {
          maxRequestBodyBytes: 1024 * 1024,
          maxResponseBodyBytes: 1024 * 1024,
          trustedClientIpHeader: '',
        },
        debug: { authFlow: false, clientAuthFlow: false, serverAuthFlow: false },
        routeProtection: { redirectTo: '/auth/signin', preserveReturnTo: true },
      },
    })

    decodeUserFromJwtMock.mockReturnValue(null)
  })

  it('treats 500 token exchange as misconfig (dev throw + detailed error, prod generic error)', async () => {
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
      // Dev: hard-fails the SSR render, and the client-visible error carries
      // implementation detail to speed up local debugging.
      await expect(run).rejects.toThrow(/token exchange/i)
      expect(String(stateStore.get('convex:authError')?.value ?? '')).toMatch(
        /convex\/token|token exchange/i,
      )
    } else {
      // Prod: never leak secret/file hints or raw upstream text to the client.
      await expect(run).resolves.toBeUndefined()
      expect(stateStore.get('convex:authError')?.value).toBe(
        'Authentication is temporarily unavailable',
      )
    }
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
    // Auth-enabled SSR responses always vary by cookie, but a no-token response
    // must NOT be marked private/no-store (vNext §9).
    expect(setHeaderMock).toHaveBeenCalledWith('Vary', 'Cookie')
    expect(setHeaderMock).not.toHaveBeenCalledWith('Cache-Control', 'private, no-store')
  })

  it('sets Cache-Control: private, no-store when a token is hydrated', async () => {
    decodeUserFromJwtMock.mockReturnValue({ id: 'user-1', email: 'user@example.com' })
    fetchWithTimeoutMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/convex/token')) {
        return createResponse(200, { token: 'jwt-1' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const plugin = (await import('../../src/runtime/plugin.server')).default as () => Promise<void>
    await expect(plugin()).resolves.toBeUndefined()

    expect(stateStore.get('convex:token')?.value).toBe('jwt-1')
    expect(setHeaderMock).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
  })
})
