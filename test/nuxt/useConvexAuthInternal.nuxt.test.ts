import { describe, expect, it } from 'vitest'

import { useNuxtApp, useState } from '#imports'

import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import { useConvexAuthController } from '../../src/runtime/composables/internal/useConvexAuthController'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

function withAuthRuntimeDisabled(options: Record<string, unknown> = {}) {
  return {
    convexConfig: {
      auth: {
        enabled: false,
      },
    },
    ...options,
  }
}

describe('useConvexAuthController (Nuxt runtime)', () => {
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

      return { auth: useConvexAuth(), internal: useConvexAuthController() }
    }, withAuthRuntimeDisabled())

    await result.internal.refreshAuth()
    expect(result.internal.token.value).toBe('new.jwt.token')
    expect(result.auth.user.value).toEqual({ id: 'u2' })
    expect(result.auth.isAuthenticated.value).toBe(true)
    expect(result.auth.isPending.value).toBe(false)
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

      return { auth: useConvexAuth(), internal: useConvexAuthController() }
    }, withAuthRuntimeDisabled())

    await expect(result.internal.awaitAuthReady({ timeoutMs: 200 })).resolves.toBe(true)
    expect(result.auth.isAuthenticated.value).toBe(true)
  })

  it('awaitAuthReady returns false when pending does not settle before timeout', async () => {
    const { result } = await captureInNuxt(() => {
      const pending = useState<boolean>('convex:pending')
      const token = useState<string | null>('convex:token')
      const user = useState<Record<string, unknown> | null>('convex:user')
      pending.value = true
      token.value = null
      user.value = null
      return useConvexAuthController()
    }, withAuthRuntimeDisabled())

    await expect(result.awaitAuthReady({ timeoutMs: 5 })).resolves.toBe(false)
  })

  it('exposes token, authError, refreshAuth, and awaitAuthReady', async () => {
    const { result } = await captureInNuxt(() => useConvexAuthController(), withAuthRuntimeDisabled())

    expect('token' in result).toBe(true)
    expect('authError' in result).toBe(true)
    expect('refreshAuth' in result).toBe(true)
    expect('awaitAuthReady' in result).toBe(true)
    expect(result.authError.value).toBeNull()
  })
})
