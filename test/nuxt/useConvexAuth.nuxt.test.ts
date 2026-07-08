import { describe, expect, it, vi } from 'vitest'

import { useNuxtApp, useState } from '#imports'

import { createConvexAuthEngine, type ConvexAuthEngine } from '../../src/runtime/auth/client-engine'
import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import type { ConvexUser } from '../../src/runtime/utils/types'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

/**
 * useConvexAuth() no longer constructs a throwaway auth engine when
 * `$convexAuthEngine` is missing (F-34) — that provisioning is
 * `plugin.client.ts`'s job in real apps. Tests that want to exercise the
 * *real* client-engine signOut/refreshAuth logic (not a stub) must wire it
 * up the same way the plugin does: a real engine sharing the composable's
 * own useState-backed token/user/pending/authError refs.
 */
function provideRealAuthEngine(nuxtApp: ReturnType<typeof useNuxtApp>): ConvexAuthEngine {
  const token = useState<string | null>('convex:token')
  const user = useState<ConvexUser | null>('convex:user')
  const pending = useState<boolean>('convex:pending')
  const authError = useState<string | null>('convex:authError')

  const engine = createConvexAuthEngine({
    nuxtApp,
    authClient:
      (nuxtApp.$auth as Parameters<typeof createConvexAuthEngine>[0]['authClient']) ?? null,
    state: { token, user, pending, authError },
  })

  Object.defineProperty(nuxtApp, '$convexAuthEngine', {
    configurable: true,
    value: engine,
  })

  return engine
}

describe('useConvexAuth (Nuxt runtime)', () => {
  it('delegates signOut and refreshAuth to the injected auth engine', async () => {
    const engine: ConvexAuthEngine = {
      attachConvexClient: vi.fn(),
      signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
      refreshAuth: vi.fn(async () => {}),
      awaitAuthReady: vi.fn(async () => true),
    }

    const { result, nuxtApp } = await captureInNuxt(() => {
      const nuxtApp = useNuxtApp()
      Object.defineProperty(nuxtApp, '$convexAuthEngine', {
        configurable: true,
        value: engine,
      })
      return useConvexAuth()
    })

    await result.signOut()
    await result.refreshAuth()

    expect(engine.signOut).toHaveBeenCalledTimes(1)
    expect(engine.refreshAuth).toHaveBeenCalledTimes(1)

    delete (nuxtApp as typeof nuxtApp & { $convexAuthEngine?: unknown }).$convexAuthEngine
  })

  it('computes authenticated state from token + user and signOut clears local state', async () => {
    const signOut = vi.fn(async () => ({ data: { success: true }, error: null }))

    const { result, nuxtApp } = await captureInNuxt(
      () => {
        const nuxtApp = useNuxtApp()
        const token = useState<string | null>('convex:token')
        const user = useState<unknown>('convex:user')
        token.value = 'jwt.token'
        user.value = { id: 'u1' }
        provideRealAuthEngine(nuxtApp)
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

    delete (nuxtApp as typeof nuxtApp & { $convexAuthEngine?: unknown }).$convexAuthEngine
  })

  it('preserves local auth state when upstream signOut fails', async () => {
    const signOut = vi.fn(async () => {
      throw new Error('network down')
    })

    const { result, nuxtApp } = await captureInNuxt(
      () => {
        const nuxtApp = useNuxtApp()
        const token = useState<string | null>('convex:token')
        const user = useState<unknown>('convex:user')
        token.value = 'jwt.token'
        user.value = { id: 'u1' }
        provideRealAuthEngine(nuxtApp)
        return useConvexAuth()
      },
      {
        auth: { signOut },
      },
    )

    await expect(result.signOut()).rejects.toThrow('network down')
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(result.token.value).toBe('jwt.token')
    expect(result.user.value).toEqual({ id: 'u1' })
    expect(result.authError.value).toBe('network down')
    expect(result.isAuthenticated.value).toBe(true)
    expect(result.isPending.value).toBe(false)

    delete (nuxtApp as typeof nuxtApp & { $convexAuthEngine?: unknown }).$convexAuthEngine
  })

  it('preserves local auth state when Better Auth returns a signOut error envelope', async () => {
    const signOut = vi.fn(async () => ({
      data: null,
      error: { message: 'session still active' },
    }))

    const { result, nuxtApp } = await captureInNuxt(
      () => {
        const nuxtApp = useNuxtApp()
        const token = useState<string | null>('convex:token')
        const user = useState<unknown>('convex:user')
        token.value = 'jwt.token'
        user.value = { id: 'u1' }
        provideRealAuthEngine(nuxtApp)
        return useConvexAuth()
      },
      {
        auth: { signOut },
      },
    )

    await expect(result.signOut()).rejects.toThrow('session still active')
    expect(result.token.value).toBe('jwt.token')
    expect(result.user.value).toEqual({ id: 'u1' })
    expect(result.authError.value).toBe('session still active')

    delete (nuxtApp as typeof nuxtApp & { $convexAuthEngine?: unknown }).$convexAuthEngine
  })

  it('refreshAuth resolves after refresh hook updates token', async () => {
    const { result, nuxtApp } = await captureInNuxt(() => {
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

      provideRealAuthEngine(nuxtApp)
      return useConvexAuth()
    })

    await result.refreshAuth()
    expect(result.token.value).toBe('new.jwt.token')
    expect(result.user.value).toEqual({ id: 'u2' })
    expect(result.isAuthenticated.value).toBe(true)
    expect(result.isPending.value).toBe(false)

    delete (nuxtApp as typeof nuxtApp & { $convexAuthEngine?: unknown }).$convexAuthEngine
  })

  it('signOut/refreshAuth throw a descriptive error when the auth engine is unavailable (F-34)', async () => {
    // `$convexAuthEngine` is only provided by plugin.client.ts (never during
    // SSR). useConvexAuth() must not silently construct a throwaway engine
    // to paper over that — it should fail loudly and explain why.
    const { result } = await captureInNuxt(() => useConvexAuth())

    await expect(result.signOut()).rejects.toThrow(/auth engine is unavailable/i)
    await expect(result.refreshAuth()).rejects.toThrow(/auth engine is unavailable/i)
  })

  it('returns callable SSR proxies that reject loudly when auth client is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = await captureInNuxt(() => {
      return useConvexAuth()
    })
    expect(typeof result.signIn.email).toBe('function')
    expect(typeof result.signUp.email).toBe('function')

    await expect(
      result.signIn.email({
        email: 'stub@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow(/client-only/i)
    await expect(
      result.signUp.email({
        name: 'Stub User',
        email: 'stub@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow(/client-only/i)
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

    const { result } = await captureInNuxt(
      () => {
        return useConvexAuth()
      },
      {
        auth: fakeAuthClient,
      },
    )

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
