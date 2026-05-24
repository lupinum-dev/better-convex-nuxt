import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TOKEN_CACHE_MS, TOKEN_EXPIRY_SAFETY_BUFFER_MS } from '../../src/runtime/utils/constants'
import { mintJwt, mintJwtExpiringIn } from '../support/auth/jwt-factory'
import {
  authLogMock,
  clientState,
  createDeferred,
  createNuxtAppMock,
  loadClientPlugin,
  resetPluginClientTestkit,
  stateStore,
  tokenMock,
} from '../support/unit/plugin-testkit'

describe('plugin.client token cache', () => {
  beforeEach(() => {
    resetPluginClientTestkit()
  })

  it('reuses the recent token cache without another exchange and can decode the user again', async () => {
    const hydratedToken = mintJwt({ sub: 'u-cache', email: 'cache@test.com' })
    stateStore.set('convex:token', { value: hydratedToken })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: true }) as never)

    const fetchToken = clientState.fetchToken
    await fetchToken!({ forceRefreshToken: false })

    stateStore.get('convex:user')!.value = null

    await expect(fetchToken!({ forceRefreshToken: true })).resolves.toBe(hydratedToken)
    expect(tokenMock).not.toHaveBeenCalled()
    expect(stateStore.get('convex:user')?.value).toEqual(
      expect.objectContaining({ email: 'cache@test.com' }),
    )
    expect(stateStore.get('convex:user')?.value).not.toHaveProperty('id')
  })

  it('fails closed and logs when the recent token cache holds a token that can no longer be decoded', async () => {
    const hydratedToken = mintJwt({ sub: 'u-cache-bad', email: 'cache-bad@test.com' })
    stateStore.set('convex:token', { value: hydratedToken })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: true }) as never)

    const fetchToken = clientState.fetchToken
    await fetchToken!({ forceRefreshToken: false })

    stateStore.get('convex:token')!.value = 'not-a-valid.jwt'
    stateStore.get('convex:user')!.value = null

    await expect(fetchToken!({ forceRefreshToken: true })).resolves.toBeNull()
    expect(tokenMock).not.toHaveBeenCalled()
    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(authLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'client-fetchToken:cache',
        outcome: 'error',
        details: expect.objectContaining({
          source: 'recent-token-cache',
        }),
      }),
    )
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

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: true }) as never)

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

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: true }) as never)

    const fetchToken = clientState.fetchToken
    await fetchToken!({ forceRefreshToken: false })

    await expect(fetchToken!({ forceRefreshToken: true })).resolves.toBe(freshToken)
    expect(tokenMock).toHaveBeenCalledTimes(1)
  })

  it('keeps a replacement forced in-flight request alive when an older non-forced request settles', async () => {
    const replacementToken = mintJwt({ sub: 'u-replacement', email: 'replacement@test.com' })
    const fallbackToken = mintJwt({ sub: 'u-fallback', email: 'fallback@test.com' })
    const firstResponse = createDeferred<{ data: null; error: null }>()
    const secondResponse = createDeferred<{ data: { token: string }; error: null }>()

    tokenMock
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise)
      .mockResolvedValueOnce({ data: { token: fallbackToken }, error: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: false }) as never)

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
})
