import { describe, expect, it, vi } from 'vitest'
import { computed, ref, watch } from 'vue'

import { useNuxtApp, useState } from '#imports'

import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinator,
  type ConvexAuthCoordinatorState,
} from '../../src/runtime/auth/client-engine'
import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import type { ConvexUser } from '../../src/runtime/utils/types'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

function makeJwt(sub: string): string {
  const toBase64Url = (value: string) =>
    Buffer.from(value, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  const payload = { sub, exp: Math.floor(Date.now() / 1000) + 3600 }
  return `${toBase64Url(JSON.stringify({ alg: 'none' }))}.${toBase64Url(JSON.stringify(payload))}.sig`
}

/**
 * Phase 3: `useConvexAuth()` derives its reactive contract (status/isPending/
 * isAuthenticated/user/token/error) from the SSR-seeded `useState` refs and
 * delegates operations (signOut/refresh/ready) plus the integrated signIn/signUp
 * namespaces to the per-app coordinator on `$convexAuthCoordinator`.
 */
function provideFakeCoordinator(
  nuxtApp: ReturnType<typeof useNuxtApp>,
  overrides: Partial<ConvexAuthCoordinator> = {},
): ConvexAuthCoordinator {
  const coordinator = {
    port: {} as ConvexAuthCoordinator['port'],
    status: computed(() => 'anonymous' as const),
    isPending: computed(() => false),
    isAuthenticated: computed(() => false),
    token: ref(null),
    user: ref(null),
    error: computed(() => null),
    wrapNamespace: <T extends object>(n: T) => n,
    integratedSignIn: null,
    integratedSignUp: null,
    ready: vi.fn(async () => 'anonymous' as const),
    refresh: vi.fn(async () => {}),
    signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
    attachPrimary: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as ConvexAuthCoordinator

  Object.defineProperty(nuxtApp, '$convexAuthCoordinator', {
    configurable: true,
    value: coordinator,
  })
  return coordinator
}

describe('useConvexAuth (Nuxt runtime, Phase 3)', () => {
  it('returns the stable disabled contract for an auth-disabled build', async () => {
    const { result } = await captureInNuxt(() => useConvexAuth(), {
      convexConfig: { auth: false },
    })

    expect(result.status.value).toBe('disabled')
    expect(result.isAuthenticated.value).toBe(false)
    expect(result.isPending.value).toBe(false)
    expect(result.client).toBe(null)
    await expect(result.ready()).resolves.toBe('disabled')
    await expect(result.signOut()).rejects.toThrow()
    await expect(result.refresh()).rejects.toThrow()
  })

  it('derives authenticated state from token + user', async () => {
    const { result } = await captureInNuxt(
      () => {
        const token = useState<string | null>('convex:token')
        const user = useState<ConvexUser | null>('convex:user')
        const pending = useState<boolean>('convex:pending')
        pending.value = false
        token.value = 'jwt.token'
        user.value = { id: 'u1' } as ConvexUser
        return useConvexAuth()
      },
      { convexConfig: { auth: {} } },
    )

    expect(result.isAuthenticated.value).toBe(true)
    expect(result.status.value).toBe('authenticated')
    expect(result.token.value).toBe('jwt.token')
  })

  it('derives loading while unsettled and error when settled with an authError', async () => {
    const { result: loading } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending')
        const authError = useState<string | null>('convex:authError')
        authError.value = null
        pending.value = true
        return useConvexAuth()
      },
      { convexConfig: { auth: {} } },
    )
    expect(loading.status.value).toBe('loading')

    const { result: errored } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending')
        const authError = useState<string | null>('convex:authError')
        pending.value = false
        authError.value = 'token exchange failed'
        return useConvexAuth()
      },
      { convexConfig: { auth: {} } },
    )
    expect(errored.status.value).toBe('error')
    expect(errored.error.value?.message).toContain('token exchange failed')
  })

  it('delegates signOut/refresh/ready to the injected coordinator', async () => {
    let coordinator!: ConvexAuthCoordinator
    const { result, nuxtApp } = await captureInNuxt(
      () => {
        const app = useNuxtApp()
        coordinator = provideFakeCoordinator(app)
        return useConvexAuth()
      },
      { convexConfig: { auth: {} } },
    )

    await result.signOut()
    await result.refresh()
    await result.ready({ timeoutMs: 10 })
    expect(coordinator.signOut).toHaveBeenCalledTimes(1)
    expect(coordinator.refresh).toHaveBeenCalledTimes(1)
    expect(coordinator.ready).toHaveBeenCalledTimes(1)

    delete (nuxtApp as typeof nuxtApp & { $convexAuthCoordinator?: unknown }).$convexAuthCoordinator
  })

  it('exposes the coordinator integrated signIn/signUp namespaces', async () => {
    const signInNamespace = { email: async () => ({ data: { token: 't' }, error: null }) }
    const { result, nuxtApp } = await captureInNuxt(
      () => {
        const app = useNuxtApp()
        provideFakeCoordinator(app, {
          integratedSignIn: signInNamespace,
        })
        return useConvexAuth()
      },
      { convexConfig: { auth: {} } },
    )

    expect(result.signIn).toBe(signInNamespace)

    delete (nuxtApp as typeof nuxtApp & { $convexAuthCoordinator?: unknown }).$convexAuthCoordinator
  })

  it('SSR-authenticated hydration never exposes "loading" (vNext §5.3 stated exception)', async () => {
    const observed: string[] = []
    const { result, wrapper } = await captureInNuxt(
      () => {
        const token = useState<string | null>('convex:token', () => null)
        const user = useState<ConvexUser | null>('convex:user', () => null)
        const pending = useState<boolean>('convex:pending', () => true)
        const authError = useState<string | null>('convex:authError', () => null)

        // Simulate the SSR-hydrated snapshot published BEFORE the auth-enabled
        // client plugin (and its `attachPrimary`) ever runs, exactly as
        // `useConvexAuth()` seeds hydrated state from payload-restored refs.
        token.value = makeJwt('A')
        user.value = { id: 'A' } as ConvexUser
        pending.value = false
        authError.value = null

        const auth = useConvexAuth()
        watch(auth.status, (value) => observed.push(value), { immediate: true, flush: 'sync' })
        return auth
      },
      { convexConfig: { auth: {} } },
    )

    expect(result.status.value).toBe('authenticated')
    expect(observed).toEqual(['authenticated'])
    expect(observed).not.toContain('loading')

    wrapper.unmount()
  })

  it('a real coordinator attached to a hydrated snapshot settles without ever publishing loading', async () => {
    // End-to-end: the REAL coordinator's `attachPrimary` hydration path
    // (internal §6.3/§6.4) publishes the settled authenticated state before
    // client-side confirmation; the fake client below resolves confirmation
    // synchronously, but `status` must never observe `loading` in between.
    const observed: string[] = []
    const authClient = {
      convex: { token: async () => ({ data: { token: makeJwt('A') }, error: null }) },
      signIn: {},
      signUp: {},
    } as unknown as AuthClientWithConvex

    await captureInNuxt(
      () => {
        const token = useState<string | null>('convex:token', () => null)
        const user = useState<ConvexUser | null>('convex:user', () => null)
        const pending = useState<boolean>('convex:pending', () => true)
        const authError = useState<string | null>('convex:authError', () => null)
        token.value = makeJwt('A')
        user.value = { id: 'A' } as ConvexUser
        pending.value = false
        authError.value = null

        const state: ConvexAuthCoordinatorState = { token, user, pending, authError }
        const coordinator = createConvexAuthCoordinator({ authClient, state })
        watch(coordinator.status, (value) => observed.push(value), {
          immediate: true,
          flush: 'sync',
        })
        coordinator.attachPrimary({
          setAuth: (
            fetcher: (o: { forceRefreshToken: boolean }) => Promise<string | null>,
            onChange: (ok: boolean) => void,
          ) => {
            void Promise.resolve(fetcher({ forceRefreshToken: false })).then((t) =>
              onChange(Boolean(t)),
            )
          },
        } as unknown as import('convex/browser').ConvexClient)
        return coordinator
      },
      { convexConfig: { auth: {} } },
    )

    expect(observed[0]).toBe('authenticated')
    expect(observed).not.toContain('loading')
  })

  it('HMR-safe: reevaluating the auth plugin on the same app reuses the existing coordinator', async () => {
    // Models `plugin.auth.client.ts`'s idempotency guard (`if
    // (nuxtApp.$convexAuthCoordinator) return`) directly against the real
    // coordinator factory: a second "plugin run" on the SAME nuxtApp must not
    // create a second coordinator instance (internal §17.3 HMR reuse).
    let createCount = 0
    const authClient = {
      convex: { token: async () => ({ data: null, error: null }) },
      signIn: {},
      signUp: {},
    } as unknown as AuthClientWithConvex

    function runPluginOnce(nuxtApp: ReturnType<typeof useNuxtApp>) {
      const existing = (
        nuxtApp as typeof nuxtApp & { $convexAuthCoordinator?: ConvexAuthCoordinator }
      ).$convexAuthCoordinator
      if (existing) return existing
      createCount += 1
      const state: ConvexAuthCoordinatorState = {
        token: useState('convex:token', () => null),
        user: useState('convex:user', () => null),
        pending: useState('convex:pending', () => false),
        authError: useState('convex:authError', () => null),
      }
      const coordinator = createConvexAuthCoordinator({ authClient, state })
      Object.defineProperty(nuxtApp, '$convexAuthCoordinator', {
        configurable: true,
        value: coordinator,
      })
      return coordinator
    }

    const { nuxtApp } = await captureInNuxt(
      () => {
        const app = useNuxtApp()
        const first = runPluginOnce(app)
        const second = runPluginOnce(app) // simulated HMR reevaluation
        expect(second).toBe(first)
        return { first, second }
      },
      { convexConfig: { auth: {} } },
    )

    expect(createCount).toBe(1)
    delete (nuxtApp as typeof nuxtApp & { $convexAuthCoordinator?: unknown }).$convexAuthCoordinator
  })
})
