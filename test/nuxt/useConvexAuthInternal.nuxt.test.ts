import { describe, expect, it } from 'vitest'

import { useState } from '#imports'

import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import { useConvexAuthController } from '../../src/runtime/composables/internal/useConvexAuthController'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { installMockAuthEngine } from '../harness/nuxt-auth-engine'

describe('useConvexAuthController (Nuxt runtime)', () => {
  it('refreshAuth resolves after the shared auth engine commits the refreshed token', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine({
        fetchAuthState: async () => ({
          token: 'new.jwt.token',
          user: { id: 'u2' },
          error: null,
          source: 'exchange',
        }),
      })

      return { auth: useConvexAuth(), internal: useConvexAuthController() }
    })

    await result.internal.refreshAuth()
    expect(result.internal.token.value).toBe('new.jwt.token')
    expect(result.auth.user.value).toEqual({ id: 'u2' })
    expect(result.auth.isAuthenticated.value).toBe(true)
    expect(result.auth.isPending.value).toBe(false)
  })

  it('awaitAuthReady resolves final auth state without throwing', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine({
        initialPending: true,
      })

      const pending = useState<boolean>('convex:pending')
      const token = useState<string | null>('convex:token')
      const user = useState<{ id: string } | null>('convex:user')

      setTimeout(() => {
        token.value = 'ready.jwt.token'
        user.value = { id: 'u-ready' }
        pending.value = false
      }, 10)

      return { auth: useConvexAuth(), internal: useConvexAuthController() }
    })

    await expect(result.internal.awaitAuthReady({ timeoutMs: 200 })).resolves.toBe(true)
    expect(result.auth.isAuthenticated.value).toBe(true)
  })

  it('awaitAuthReady returns false when pending does not settle before timeout', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine({
        initialPending: true,
      })
      return useConvexAuthController()
    })

    await expect(result.awaitAuthReady({ timeoutMs: 5 })).resolves.toBe(false)
  })

  it('exposes token, authError, refreshAuth, and awaitAuthReady without a pre-seeded error', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine()
      return useConvexAuthController()
    })

    expect('token' in result).toBe(true)
    expect('authError' in result).toBe(true)
    expect('refreshAuth' in result).toBe(true)
    expect('awaitAuthReady' in result).toBe(true)
    expect(result.authError.value).toBeNull()
  })
})
