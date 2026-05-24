import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mintJwt } from '../support/auth/jwt-factory'
import {
  clientState,
  createNuxtAppMock,
  loadClientPlugin,
  resetPluginClientTestkit,
  stateStore,
  tokenMock,
} from '../support/unit/plugin-testkit'

describe('plugin.client hydration', () => {
  beforeEach(() => {
    resetPluginClientTestkit()
  })

  it('hydrates a missing user directly from a valid SSR token without exchanging again', async () => {
    const hydratedToken = mintJwt({ sub: 'u-hydrated', email: 'hydrated@test.com' })
    stateStore.set('convex:token', { value: hydratedToken })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: true }) as never)

    const fetchToken = clientState.fetchToken
    const token = await fetchToken!({ forceRefreshToken: false })

    expect(token).toBe(hydratedToken)
    expect(tokenMock).not.toHaveBeenCalled()
    expect(stateStore.get('convex:user')?.value).toEqual(
      expect.objectContaining({ email: 'hydrated@test.com' }),
    )
    expect(stateStore.get('convex:user')?.value).not.toHaveProperty('id')
    expect(stateStore.get('convex:authError')?.value).toBeNull()
  })

  it('fails closed and logs when a hydrated SSR token cannot be decoded', async () => {
    stateStore.set('convex:token', { value: 'not-a-valid.jwt' })
    stateStore.set('convex:user', { value: null })
    stateStore.set('convex:authError', { value: null })
    vi.stubGlobal('fetch', vi.fn())

    const plugin = await loadClientPlugin()
    await plugin(createNuxtAppMock({ serverRendered: true }) as never)

    const fetchToken = clientState.fetchToken
    await expect(fetchToken!({ forceRefreshToken: false })).resolves.toBeNull()

    expect(tokenMock).not.toHaveBeenCalled()
    expect(stateStore.get('convex:token')?.value).toBeNull()
    expect(stateStore.get('convex:user')?.value).toBeNull()
    expect(String(stateStore.get('convex:authError')?.value ?? '')).toMatch(/invalid auth token/i)
  })

  describe('normalizeHydratedUser edge cases', () => {
    async function initPluginWithHydratedUser(hydratedToken: string, hydratedUser: unknown) {
      stateStore.set('convex:token', { value: hydratedToken })
      stateStore.set('convex:user', { value: hydratedUser })

      const plugin = await loadClientPlugin()
      await plugin(createNuxtAppMock({ serverRendered: true }) as never)
    }

    it('rejects an object without session profile fields and decodes user from JWT', async () => {
      const hydratedToken = mintJwt({ sub: 'u-edge', email: 'edge@test.com' })
      await initPluginWithHydratedUser(hydratedToken, { name: 'No ID' })

      const result = await clientState.fetchToken?.({ forceRefreshToken: false })
      expect(result).toBe(hydratedToken)
      expect(stateStore.get('convex:user')?.value).toMatchObject({ email: 'edge@test.com' })
      expect(stateStore.get('convex:user')?.value).not.toHaveProperty('id')
    })

    it('rejects a user object with no session profile fields', async () => {
      const hydratedToken = mintJwt({ sub: 'u-num', email: 'num@test.com' })
      await initPluginWithHydratedUser(hydratedToken, { id: 42 })

      const result = await clientState.fetchToken?.({ forceRefreshToken: false })
      expect(result).toBe(hydratedToken)
      expect(stateStore.get('convex:user')?.value).toMatchObject({ email: 'num@test.com' })
      expect(stateStore.get('convex:user')?.value).not.toHaveProperty('id')
    })

    it('rejects an array as not a valid user', async () => {
      const hydratedToken = mintJwt({ sub: 'u-arr', email: 'arr@test.com' })
      await initPluginWithHydratedUser(hydratedToken, ['not', 'a', 'user'])

      const result = await clientState.fetchToken?.({ forceRefreshToken: false })
      expect(result).toBe(hydratedToken)
      expect(stateStore.get('convex:user')?.value).toMatchObject({ email: 'arr@test.com' })
      expect(stateStore.get('convex:user')?.value).not.toHaveProperty('id')
    })

    it('rejects a string primitive as not a valid user', async () => {
      const hydratedToken = mintJwt({ sub: 'u-str', email: 'str@test.com' })
      await initPluginWithHydratedUser(hydratedToken, 'just-a-string')

      const result = await clientState.fetchToken?.({ forceRefreshToken: false })
      expect(result).toBe(hydratedToken)
      expect(stateStore.get('convex:user')?.value).toMatchObject({ email: 'str@test.com' })
      expect(stateStore.get('convex:user')?.value).not.toHaveProperty('id')
    })
  })
})
