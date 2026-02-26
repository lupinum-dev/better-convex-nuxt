import { describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'
import { useState } from '#imports'

import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

describe('useConvexAuth (Nuxt runtime)', () => {
  it('computes authenticated state from token + user and signOut clears local state', async () => {
    const signOut = vi.fn(async () => ({ data: { success: true }, error: null }))

    const { result } = await captureInNuxt(() => {
      const token = useState<string | null>('convex:token')
      const user = useState<unknown>('convex:user')
      token.value = 'jwt.token'
      user.value = { id: 'u1' }
      return useConvexAuth()
    }, {
      auth: { signOut },
    })

    expect(result.isAuthenticated.value).toBe(true)
    await result.signOut()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(result.token.value).toBeNull()
    expect(result.user.value).toBeNull()
    expect(result.isAuthenticated.value).toBe(false)
  })

  it('refreshAuth resolves after refresh-complete signal updates token', async () => {
    const { result } = await captureInNuxt(() => {
      const token = useState<string | null>('convex:token')
      const user = useState<Record<string, unknown> | null>('convex:user')
      const refreshSignal = useState<number>('convex:refreshSignal')
      const refreshCompleteSignal = useState<number>('convex:refreshCompleteSignal')
      const authError = useState<string | null>('convex:authError')

      token.value = null
      user.value = null
      authError.value = null

      watch(refreshSignal, (next, prev) => {
        if (next <= prev) return
        token.value = 'new.jwt.token'
        user.value = { id: 'u2' }
        refreshCompleteSignal.value += 1
      })

      return useConvexAuth()
    })

    await result.refreshAuth()
    expect(result.token.value).toBe('new.jwt.token')
    expect(result.user.value).toEqual({ id: 'u2' })
    expect(result.isAuthenticated.value).toBe(true)
    expect(result.isPending.value).toBe(false)
  })
})

