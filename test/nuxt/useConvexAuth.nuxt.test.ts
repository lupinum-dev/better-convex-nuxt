import { describe, expect, it, vi } from 'vitest'

import { useNuxtApp, useState } from '#imports'

import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

describe('useConvexAuth (Nuxt runtime)', () => {
  it('does not emit convex:auth:changed for the initial hydrated auth state', async () => {
    const hookSpy = vi.fn()

    const { wrapper } = await captureInNuxt(() => {
      const nuxtApp = useNuxtApp()
      const token = useState<string | null>('convex:token')
      const user = useState<unknown>('convex:user')
      token.value = 'jwt.token'
      user.value = { id: 'u1' }
      nuxtApp.hook('convex:auth:changed', hookSpy)
      return useConvexAuth()
    }, {
      auth: { signOut: vi.fn() },
    })

    expect(hookSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('emits convex:auth:changed when auth becomes authenticated via refresh', async () => {
    const hookSpy = vi.fn()

    const { result, wrapper } = await captureInNuxt(() => {
      const nuxtApp = useNuxtApp()
      const token = useState<string | null>('convex:token')
      const user = useState<Record<string, unknown> | null>('convex:user')
      const authError = useState<string | null>('convex:authError')

      token.value = null
      user.value = null
      authError.value = null

      nuxtApp.hook('convex:auth:changed', hookSpy)
      nuxtApp.hook('better-convex:auth:refresh', async () => {
        token.value = 'new.jwt.token'
        user.value = { id: 'u2' }
      })

      return useConvexAuth()
    })

    await result.refreshAuth()
    await Promise.resolve()

    expect(hookSpy).toHaveBeenCalledTimes(1)
    expect(hookSpy).toHaveBeenCalledWith({
      isAuthenticated: true,
      previousIsAuthenticated: false,
      user: { id: 'u2' },
      previousUser: null,
    })
    wrapper.unmount()
  })

  it('computes authenticated state from token + user and signOut deauths through the invalidate hook', async () => {
    const signOut = vi.fn(async () => undefined)
    const hookSpy = vi.fn()
    const invalidateSpy = vi.fn()

    const { result, wrapper } = await captureInNuxt(
      () => {
        const nuxtApp = useNuxtApp()
        const token = useState<string | null>('convex:token')
        const user = useState<unknown>('convex:user')
        token.value = 'jwt.token'
        user.value = { id: 'u1' }
        nuxtApp.hook('convex:auth:changed', hookSpy)
        nuxtApp.hook('better-convex:auth:invalidate', async () => {
          invalidateSpy()
        })
        return useConvexAuth()
      },
      {
        auth: { signOut },
      },
    )

    expect(result.isAuthenticated.value).toBe(true)
    await result.signOut()
    await Promise.resolve()
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(result.user.value).toBeNull()
    expect(result.isAuthenticated.value).toBe(false)
    expect(result.authError.value).toBeNull()
    expect(result.isSessionExpired.value).toBe(false)
    expect(hookSpy).toHaveBeenCalledTimes(1)
    expect(hookSpy).toHaveBeenCalledWith({
      isAuthenticated: false,
      previousIsAuthenticated: true,
      user: null,
      previousUser: { id: 'u1' },
    })
    wrapper.unmount()
  })

  it('signOut throws on upstream failure but keeps local auth state deauthed', async () => {
    const signOut = vi.fn(async () => {
      throw new Error('logout failed')
    })
    const invalidateSpy = vi.fn()

    const { result, wrapper } = await captureInNuxt(
      () => {
        const nuxtApp = useNuxtApp()
        const token = useState<string | null>('convex:token')
        const user = useState<unknown>('convex:user')
        token.value = 'jwt.token'
        user.value = { id: 'u1' }
        nuxtApp.hook('better-convex:auth:invalidate', async () => {
          invalidateSpy()
        })
        return useConvexAuth()
      },
      {
        auth: { signOut },
      },
    )

    await expect(result.signOut()).rejects.toThrow('logout failed')

    expect(invalidateSpy).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(result.user.value).toBeNull()
    expect(result.isAuthenticated.value).toBe(false)
    expect(result.isSessionExpired.value).toBe(false)
    expect(result.authError.value).toBeInstanceOf(Error)
    expect(result.authError.value?.message).toBe('logout failed')
    wrapper.unmount()
  })

  it('dedupes concurrent signOut calls', async () => {
    const signOut = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10)
        }),
    )

    const { result, wrapper } = await captureInNuxt(
      () => {
        const nuxtApp = useNuxtApp()
        const token = useState<string | null>('convex:token')
        const user = useState<unknown>('convex:user')
        token.value = 'jwt.token'
        user.value = { id: 'u1' }
        nuxtApp.hook('better-convex:auth:invalidate', async () => {})
        return useConvexAuth()
      },
      {
        auth: { signOut },
      },
    )

    const first = result.signOut()
    const second = result.signOut()

    await Promise.all([first, second])

    expect(signOut).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('exposes client, refreshAuth, and authError on the public surface', async () => {
    const { result, wrapper } = await captureInNuxt(() => useConvexAuth(), {
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
    wrapper.unmount()
  })

  it('refreshAuth resolves after refresh hook updates token and user', async () => {
    const { result, wrapper } = await captureInNuxt(() => {
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
    wrapper.unmount()
  })

  it('exposes authError as Error instances', async () => {
    const { result, wrapper } = await captureInNuxt(() => {
      const authError = useState<string | null>('convex:authError')
      authError.value = 'Unauthorized'
      return useConvexAuth()
    })

    expect(result.authError.value).toBeInstanceOf(Error)
    expect(result.authError.value?.message).toBe('Unauthorized')
    wrapper.unmount()
  })

  it('emits when the authenticated user identity changes', async () => {
    const hookSpy = vi.fn()

    const { result, wrapper, flush } = await captureInNuxt(() => {
      const nuxtApp = useNuxtApp()
      const token = useState<string | null>('convex:token')
      const user = useState<Record<string, unknown> | null>('convex:user')

      token.value = 'jwt.token'
      user.value = { id: 'u1' }
      nuxtApp.hook('convex:auth:changed', hookSpy)

      return {
        auth: useConvexAuth(),
        user,
      }
    }, {
      auth: { signOut: vi.fn() },
    })

    result.user.value = { id: 'u2' }
    await flush()

    expect(result.auth.isAuthenticated.value).toBe(true)
    expect(hookSpy).toHaveBeenCalledTimes(1)
    expect(hookSpy).toHaveBeenCalledWith({
      isAuthenticated: true,
      previousIsAuthenticated: true,
      user: { id: 'u2' },
      previousUser: { id: 'u1' },
    })
    wrapper.unmount()
  })

  it('does not emit when a token refresh keeps the same authenticated user', async () => {
    const hookSpy = vi.fn()

    const { result, wrapper, flush } = await captureInNuxt(() => {
      const nuxtApp = useNuxtApp()
      const token = useState<string | null>('convex:token')
      const user = useState<Record<string, unknown> | null>('convex:user')

      token.value = 'jwt.token'
      user.value = { id: 'u1' }
      nuxtApp.hook('convex:auth:changed', hookSpy)

      return {
        auth: useConvexAuth(),
        token,
        user,
      }
    }, {
      auth: { signOut: vi.fn() },
    })

    result.token.value = 'jwt.token.updated'
    result.user.value = { id: 'u1' }
    await flush()

    expect(result.auth.isAuthenticated.value).toBe(true)
    expect(hookSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
