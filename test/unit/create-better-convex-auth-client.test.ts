import type { BetterAuthClientPlugin } from 'better-auth/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClientMock = vi.hoisted(() => vi.fn((options) => ({ options })))

vi.mock('better-auth/vue', () => ({
  createAuthClient: createAuthClientMock,
}))

vi.mock('@convex-dev/better-auth/client/plugins', () => ({
  convexClient: () => ({ id: 'convex', $InferServerPlugin: {} }),
}))

const runtimeConfig = vi.hoisted(() => ({
  public: {
    convex: {
      authRoute: '/api/auth',
    },
  },
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

describe('createBetterConvexAuthClient', () => {
  beforeEach(() => {
    createAuthClientMock.mockClear()
    runtimeConfig.public.convex.authRoute = '/api/auth'
    vi.stubGlobal('window', {
      location: {
        origin: 'https://app.example',
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prepends convexClient and uses the configured Nuxt auth proxy route', async () => {
    const { createBetterConvexAuthClient } =
      await import('../../src/runtime/composables/createBetterConvexAuthClient')
    const adminClient = { id: 'admin' } as BetterAuthClientPlugin

    const client = createBetterConvexAuthClient({
      plugins: [adminClient] as const,
    })

    expect(client).toEqual({ options: expect.any(Object) })
    expect(createAuthClientMock).toHaveBeenCalledTimes(1)
    expect(createAuthClientMock.mock.calls[0]?.[0]).toMatchObject({
      baseURL: 'https://app.example/api/auth',
      fetchOptions: { credentials: 'include' },
    })
    expect(
      createAuthClientMock.mock.calls[0]?.[0].plugins.map((plugin: { id: string }) => plugin.id),
    ).toEqual(['convex', 'admin'])
  })

  it('normalizes custom authRoute from runtime config', async () => {
    const { createBetterConvexAuthClient } =
      await import('../../src/runtime/composables/createBetterConvexAuthClient')
    runtimeConfig.public.convex.authRoute = 'custom/auth/'

    createBetterConvexAuthClient()

    expect(createAuthClientMock.mock.calls[0]?.[0].baseURL).toBe('https://app.example/custom/auth')
  })

  it('uses explicit baseURL instead of runtime config', async () => {
    const { createBetterConvexAuthClient } =
      await import('../../src/runtime/composables/createBetterConvexAuthClient')
    runtimeConfig.public.convex.authRoute = '/ignored'

    createBetterConvexAuthClient({
      baseURL: 'https://auth.example/api/auth',
    })

    expect(createAuthClientMock.mock.calls[0]?.[0].baseURL).toBe('https://auth.example/api/auth')
  })

  it('preserves caller fetch options while defaulting credentials to include', async () => {
    const { createBetterConvexAuthClient } =
      await import('../../src/runtime/composables/createBetterConvexAuthClient')

    createBetterConvexAuthClient({
      fetchOptions: {
        credentials: 'omit',
      },
    })

    expect(createAuthClientMock.mock.calls[0]?.[0].fetchOptions).toEqual({
      credentials: 'omit',
    })
  })

  it('throws clearly without an explicit baseURL outside the browser', async () => {
    const { createBetterConvexAuthClient } =
      await import('../../src/runtime/composables/createBetterConvexAuthClient')
    vi.stubGlobal('window', undefined)

    expect(() => createBetterConvexAuthClient()).toThrow(/baseURL is required/i)
  })
})
