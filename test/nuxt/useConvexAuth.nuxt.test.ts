import { describe, expect, it, vi } from 'vitest'

import { useNuxtApp, useState } from '#imports'

import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

describe('useConvexAuth (Nuxt runtime)', () => {
  it('computes authenticated state from token + user and signOut clears local state', async () => {
    const signOut = vi.fn(async () => ({ data: { success: true }, error: null }))

    const { result } = await captureInNuxt(
      () => {
        const token = useState<string | null>('convex:token')
        const user = useState<unknown>('convex:user')
        token.value = 'jwt.token'
        user.value = { id: 'u1' }
        return useConvexAuth()
      },
      {
        auth: { signOut },
      },
    )

    expect(result.isAuthenticated.value).toBe(true)
    await result.signOut()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(result.user.value).toBeNull()
    expect(result.isAuthenticated.value).toBe(false)
  })

  it('exposes client, refreshAuth, and authError on the public surface', async () => {
    const { result } = await captureInNuxt(() => useConvexAuth(), {
      auth: { signOut: vi.fn() },
    })

    expect('user' in result).toBe(true)
    expect('isAuthenticated' in result).toBe(true)
    expect('isPending' in result).toBe(true)
    expect('isAnonymous' in result).toBe(true)
    expect('isSessionExpired' in result).toBe(true)
    expect('signOut' in result).toBe(true)
    expect('client' in result).toBe(true)
    expect('authError' in result).toBe(true)
    expect('refreshAuth' in result).toBe(true)
    expect(result.authError.value).toBeNull()
    expect('awaitAuthReady' in result).toBe(false)
    expect('token' in result).toBe(false)
  })

  it('refreshAuth resolves after refresh hook updates token and user', async () => {
    const { result } = await captureInNuxt(() => {
      const nuxtApp = useNuxtApp()
      const token = useState<string | null>('convex:token')
      const user = useState<Record<string, unknown> | null>('convex:user')
      const authError = useState<string | null>('convex:authError')

      token.value = null
      user.value = null
      authError.value = null

      nuxtApp.hook('better-convex:auth:refresh', async () => {
        token.value = 'new.jwt.token'
        user.value = { id: 'u2' }
      })

      return useConvexAuth()
    })

    await result.refreshAuth()
    expect(result.user.value).toEqual({ id: 'u2' })
    expect(result.isAuthenticated.value).toBe(true)
    expect(result.isPending.value).toBe(false)
  })

  it('exposes authError as Error instances', async () => {
    const { result } = await captureInNuxt(() => {
      const authError = useState<string | null>('convex:authError')
      authError.value = 'Unauthorized'
      return useConvexAuth()
    })

    expect(result.authError.value).toBeInstanceOf(Error)
    expect(result.authError.value?.message).toBe('Unauthorized')
  })
})
