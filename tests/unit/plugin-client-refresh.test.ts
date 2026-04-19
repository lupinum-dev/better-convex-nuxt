import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mintJwt } from '../support/auth/jwt-factory'
import {
  authLogMock,
  clientState,
  createNuxtAppMock,
  hookRegistry,
  loadClientPlugin,
  resetPluginClientTestkit,
  stateStore,
  tokenMock,
} from '../support/unit/plugin-testkit'

describe('plugin.client refresh', () => {
  beforeEach(() => {
    resetPluginClientTestkit()
  })

  it('still performs a forced exchange after an explicit auth refresh from an anonymous SSR boot', async () => {
    const refreshedToken = mintJwt({ sub: 'u-refresh', email: 'refresh@test.com' })
    tokenMock.mockResolvedValue({ data: { token: refreshedToken }, error: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: true }) as never)

    const refreshHook = hookRegistry.get('trellis:auth:refresh')
    expect(refreshHook).toBeTypeOf('function')

    await expect(refreshHook?.()).resolves.toBeUndefined()

    expect(tokenMock).toHaveBeenCalledTimes(1)
    expect(stateStore.get('convex:token')?.value).toBe(refreshedToken)
    expect(stateStore.get('convex:authError')?.value).toBeNull()
    expect(authLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'client-fetchToken:start',
        outcome: 'success',
        details: expect.objectContaining({
          trigger: 'manual-refresh',
          forceRefreshToken: true,
        }),
      }),
    )
    expect(authLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'client-setAuth',
        outcome: 'success',
        details: expect.objectContaining({
          trigger: 'manual-refresh',
          state: 'authenticated',
        }),
      }),
    )
  })

  it('completes an explicit auth refresh even when Convex never emits onChange after fetching a token', async () => {
    const refreshedToken = mintJwt({
      sub: 'u-refresh-fallback',
      email: 'refresh-fallback@test.com',
    })
    tokenMock.mockResolvedValue({ data: { token: refreshedToken }, error: null })
    clientState.skipOnChangeAfterFetch = true
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: true }) as never)

    const refreshHook = hookRegistry.get('trellis:auth:refresh')
    expect(refreshHook).toBeTypeOf('function')

    await expect(refreshHook?.()).resolves.toBeUndefined()

    expect(tokenMock).toHaveBeenCalledTimes(1)
    expect(stateStore.get('convex:token')?.value).toBe(refreshedToken)
    expect(stateStore.get('convex:authError')?.value).toBeNull()
    expect(authLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'client-fetchToken:start',
        outcome: 'success',
        details: expect.objectContaining({
          trigger: 'manual-refresh',
        }),
      }),
    )
  })

  it('invalidates the live auth transport and clears local auth state', async () => {
    tokenMock.mockResolvedValue({
      data: { token: 'jwt-from-token-exchange' },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: false }) as never)

    const fetchToken = clientState.fetchToken
    expect(fetchToken).toBeTypeOf('function')

    await fetchToken!({ forceRefreshToken: false })
    stateStore.get('convex:user')!.value = { id: 'u1' }
    stateStore.get('convex:authError')!.value = 'stale error'

    const invalidate = hookRegistry.get('trellis:auth:invalidate')
    expect(invalidate).toBeTypeOf('function')

    await invalidate?.()

    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(stateStore.get('convex:user')?.value).toBeNull()
    expect(stateStore.get('convex:authError')?.value).toBeNull()
    await expect(
      clientState.fetchToken?.({ forceRefreshToken: false }) ?? Promise.resolve(null),
    ).resolves.toBeNull()
  })
})
