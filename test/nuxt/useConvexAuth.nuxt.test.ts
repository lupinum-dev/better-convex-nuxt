import { describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

import { useNuxtApp, useState } from '#imports'

import {
  ANONYMOUS_IDENTITY,
  LOADING_IDENTITY,
  toAuthenticatedIdentity,
  type AuthIdentity,
} from '../../src/runtime/auth/auth-identity'
import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import type { NuxtConvexAuthController } from '../../src/runtime/runtime-context'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

function controller(overrides: Partial<NuxtConvexAuthController> = {}): NuxtConvexAuthController {
  return {
    isPending: computed(() => false),
    integratedSignIn: null,
    integratedSignUp: null,
    ready: vi.fn(async () => 'anonymous' as const),
    refresh: vi.fn(async () => {}),
    signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
    dispose: vi.fn(),
    ...overrides,
  }
}

describe('useConvexAuth Nuxt facade', () => {
  it('returns a stable disabled contract', async () => {
    const { result } = await captureInNuxt(() => useConvexAuth(), {
      convexConfig: { auth: false },
    })

    expect(result.status.value).toBe('disabled')
    expect(result.isPending.value).toBe(false)
    expect(result.client).toBeNull()
    await expect(result.ready()).resolves.toBe('disabled')
    await expect(result.signOut()).rejects.toMatchObject({ kind: 'authentication' })
    await expect(result.refresh()).rejects.toMatchObject({ kind: 'authentication' })
  })

  it('derives loading, authenticated, anonymous, and error from canonical Nuxt state', async () => {
    const { result } = await captureInNuxt(
      () => {
        const identity = useState<AuthIdentity>('convex:identity')
        const pending = useState<boolean>('convex:pending')
        const authError = useState<string | null>('convex:authError')
        identity.value = LOADING_IDENTITY
        pending.value = true
        authError.value = null
        return { auth: useConvexAuth(), identity, pending, authError }
      },
      { convexConfig: { auth: {} } },
    )

    expect(result.auth.status.value).toBe('loading')
    result.identity.value = toAuthenticatedIdentity('jwt-secret', { id: 'alice' })
    result.pending.value = false
    expect(result.auth.status.value).toBe('authenticated')
    expect(result.auth.user.value?.id).toBe('alice')
    expect(result.auth.token.value).toBe('jwt-secret')

    result.identity.value = ANONYMOUS_IDENTITY
    expect(result.auth.status.value).toBe('anonymous')
    result.authError.value = 'Authentication is temporarily unavailable'
    expect(result.auth.status.value).toBe('error')
    expect(result.auth.error.value).toMatchObject({ kind: 'authentication' })
  })

  it('delegates operations and namespaces only to the per-app controller', async () => {
    const signIn = { email: vi.fn(async () => ({ data: {}, error: null })) }
    const signUp = { email: vi.fn(async () => ({ data: {}, error: null })) }
    const authController = controller({ integratedSignIn: signIn, integratedSignUp: signUp })
    const { result } = await captureInNuxt(
      () => {
        useNuxtApp().$convexRuntime!.attachAuthController(authController)
        return useConvexAuth()
      },
      { convexConfig: { auth: {} } },
    )

    expect(result.signIn).toBe(signIn)
    expect(result.signUp).toBe(signUp)
    await result.signOut()
    await result.refresh()
    await result.ready({ timeoutMs: 5 })
    expect(authController.signOut).toHaveBeenCalledOnce()
    expect(authController.refresh).toHaveBeenCalledOnce()
    expect(authController.ready).toHaveBeenCalledWith({ timeoutMs: 5 })
  })

  it('keeps two captured application controllers isolated', async () => {
    const first = controller({ ready: vi.fn(async () => 'authenticated' as const) })
    const second = controller({ ready: vi.fn(async () => 'anonymous' as const) })
    const firstResult = await captureInNuxt(
      () => {
        useNuxtApp().$convexRuntime!.attachAuthController(first)
        return useConvexAuth()
      },
      { convexConfig: { auth: {} } },
    )
    expect(await firstResult.result.ready()).toBe('authenticated')
    firstResult.wrapper.unmount()

    const secondResult = await captureInNuxt(
      () => {
        useNuxtApp().$convexRuntime!.attachAuthController(second)
        return useConvexAuth()
      },
      { convexConfig: { auth: {} } },
    )
    expect(await secondResult.result.ready()).toBe('anonymous')
    expect(first.ready).toHaveBeenCalledOnce()
    expect(second.ready).toHaveBeenCalledOnce()
  })
})
