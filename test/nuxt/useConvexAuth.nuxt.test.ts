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
    expect(result.token.value).toBeNull()
    expect(result.user.value).toBeNull()
    expect(result.isAuthenticated.value).toBe(false)
  })

  it('refreshAuth resolves after refresh hook updates token', async () => {
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
    expect(result.token.value).toBe('new.jwt.token')
    expect(result.user.value).toEqual({ id: 'u2' })
    expect(result.isAuthenticated.value).toBe(true)
    expect(result.isPending.value).toBe(false)
  })

  it('awaitAuthReady resolves final auth state without throwing', async () => {
    const { result } = await captureInNuxt(() => {
      const pending = useState<boolean>('convex:pending')
      const token = useState<string | null>('convex:token')
      const user = useState<Record<string, unknown> | null>('convex:user')
      pending.value = true
      token.value = null
      user.value = null

      setTimeout(() => {
        token.value = 'ready.jwt.token'
        user.value = { id: 'u-ready' }
        pending.value = false
      }, 10)

      return useConvexAuth()
    })

    await expect(result.awaitAuthReady({ timeoutMs: 200 })).resolves.toBe(true)
    expect(result.isAuthenticated.value).toBe(true)
  })

  it('awaitAuthReady returns false when pending does not settle before timeout', async () => {
    const { result } = await captureInNuxt(() => {
      const pending = useState<boolean>('convex:pending')
      const token = useState<string | null>('convex:token')
      const user = useState<Record<string, unknown> | null>('convex:user')
      pending.value = true
      token.value = null
      user.value = null
      return useConvexAuth()
    })

    await expect(result.awaitAuthReady({ timeoutMs: 5 })).resolves.toBe(false)
  })
})
