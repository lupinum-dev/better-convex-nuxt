import { describe, expect, it, vi } from 'vitest'

import { useState } from '#imports'

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

  it('exposes only the public 4-property surface', async () => {
    const { result } = await captureInNuxt(() => useConvexAuth())

    expect('user' in result).toBe(true)
    expect('isAuthenticated' in result).toBe(true)
    expect('isPending' in result).toBe(true)
    expect('signOut' in result).toBe(true)
    expect('token' in result).toBe(false)
    expect('authError' in result).toBe(false)
    expect('refreshAuth' in result).toBe(false)
    expect('awaitAuthReady' in result).toBe(false)
  })
})
