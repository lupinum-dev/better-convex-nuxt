import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { ConvexDevtoolsStore } from '../../src/runtime/devtools/store'
import { mintJwt } from '../support/auth/jwt-factory'
import { MockConvexClient } from '../support/nuxt/mock-convex-client'
import {
  authLogMock,
  clientState,
  createNuxtAppMock,
  getConvexRuntimeConfigMock,
  loadClientPlugin,
  resetPluginClientTestkit,
  stateStore,
  tokenMock,
} from '../support/unit/plugin-testkit'

describe('plugin.client bootstrap', () => {
  beforeEach(() => {
    resetPluginClientTestkit()
  })

  it('uses only the token exchange request on client cold boot', async () => {
    const exchangedToken = mintJwt({ sub: 'u1', email: 'alice@test.com' })
    tokenMock.mockResolvedValue({
      data: { token: exchangedToken },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: false }) as never)

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

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: false }) as never)

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

  it('skips the immediate convex-set-auth forced retry after a clean anonymous SPA boot miss', async () => {
    tokenMock.mockResolvedValue({
      data: null,
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: false }) as never)

    const fetchToken = clientState.fetchToken
    expect(fetchToken).toBeTypeOf('function')

    await expect(fetchToken!({ forceRefreshToken: false })).resolves.toBeNull()
    await expect(
      fetchToken!({ forceRefreshToken: true, trigger: 'convex-set-auth' } as never),
    ).resolves.toBeNull()

    expect(tokenMock).toHaveBeenCalledTimes(1)
    expect(authLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: expect.objectContaining({
          reason: 'spa-anonymous-client-init-already-settled',
          trigger: 'convex-set-auth',
        }),
      }),
    )
  })

  it('skips the first forced bootstrap refresh when SSR already established an anonymous session miss', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: true }) as never)

    const fetchToken = clientState.fetchToken
    expect(fetchToken).toBeTypeOf('function')

    await expect(fetchToken!({ forceRefreshToken: false })).resolves.toBeNull()
    await expect(fetchToken!({ forceRefreshToken: true })).resolves.toBeNull()

    expect(tokenMock).not.toHaveBeenCalled()
    expect(authLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: expect.objectContaining({
          reason: 'ssr-rendered-no-session-bootstrap',
        }),
      }),
    )
  })

  it('initializes the shared auth engine even when convex.url is missing', async () => {
    getConvexRuntimeConfigMock.mockReturnValue({
      url: undefined,
      siteUrl: undefined,
      auth: { enabled: true, route: '/api/auth', skipAuthRoutes: [] },
    })

    const { getSharedAuthEngine } = await import('../../src/runtime/client/auth-engine')
    const plugin = await loadClientPlugin()
    const nuxtApp = createNuxtAppMock()

    expect(plugin(nuxtApp as never)).toBeUndefined()

    const engine = getSharedAuthEngine(nuxtApp)
    expect(engine.isAuthenticated.value).toBe(false)
    expect(engine.rawAuthError.value).toMatch(/convex url not configured/i)
  })

  it('provides the devtools store during plugin setup without waiting for a later microtask', async () => {
    const { setupClientDevtools } = await import('../../src/runtime/plugin.client')
    const nuxtApp = createNuxtAppMock({ serverRendered: false })
    const client = new MockConvexClient()

    const store = setupClientDevtools(
      nuxtApp as never,
      client as never,
      {
        convexToken: ref(null),
        convexUser: ref(null),
        convexPending: ref(false),
        convexAuthError: ref(null),
        convexAuthWaterfall: ref(null),
        resolveInitialAuth: vi.fn(),
      } as never,
    )

    expect(store).toBeInstanceOf(ConvexDevtoolsStore)
    expect(nuxtApp.provide).toHaveBeenCalledWith('convexDevtoolsStore', store)
  })
})
