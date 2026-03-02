import { describe, expect, it, vi } from 'vitest'
import { useNuxtApp, useState } from '#imports'

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

  it('returns callable SSR proxies that reject loudly when auth client is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = await captureInNuxt(() => {
      return useConvexAuth()
    })
    expect(typeof result.signIn.email).toBe('function')
    expect(typeof result.signUp.email).toBe('function')

    await expect(result.signIn.email({
      email: 'stub@example.com',
      password: 'password123',
    })).rejects.toThrow(/client-only/i)
    await expect(result.signUp.email({
      name: 'Stub User',
      email: 'stub@example.com',
      password: 'password123',
    })).rejects.toThrow(/client-only/i)
  })

  it('forwards client/signIn/signUp from injected $auth', async () => {
    const fakeAuthClient = {
      signIn: {
        email: vi.fn(async () => ({ data: { ok: true, kind: 'signIn' }, error: null })),
      },
      signUp: {
        email: vi.fn(async () => ({ data: { ok: true, kind: 'signUp' }, error: null })),
      },
      signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
    }

    const { result } = await captureInNuxt(() => {
      return useConvexAuth()
    }, {
      auth: fakeAuthClient,
    })

    expect(result.client).toBeTruthy()
    expect(result.signIn).toBe(fakeAuthClient.signIn)
    expect(result.signUp).toBe(fakeAuthClient.signUp)

    const signInResult = await result.signIn.email({
      email: 'stub@example.com',
      password: 'password123',
    })

    expect(fakeAuthClient.signIn.email).toHaveBeenCalledTimes(1)
    expect(signInResult).toEqual({ data: { ok: true, kind: 'signIn' }, error: null })
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
