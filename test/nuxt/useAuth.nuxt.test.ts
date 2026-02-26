import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useNuxtApp } from '#imports'
import { computed, defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UseConvexAuthReturn } from '../../src/runtime/composables/useConvexAuth'

const { mockUseConvexAuth } = vi.hoisted(() => ({
  mockUseConvexAuth: vi.fn(),
}))

vi.mock('../../src/runtime/composables/useConvexAuth', () => ({
  useConvexAuth: mockUseConvexAuth,
}))

import { useAuth } from '../../src/runtime/composables/useAuth'

function makeConvexAuthMock(): UseConvexAuthReturn {
  const token = ref<string | null>(null)
  const user = ref(null)
  const isPending = ref(false)
  const authError = ref<string | null>(null)
  const signOut = vi.fn(async () => ({ data: { success: true }, error: null }))
  const refreshAuth = vi.fn(async () => {})

  return {
    token,
    user,
    isAuthenticated: computed(() => false),
    isPending,
    authError,
    signOut,
    refreshAuth,
  }
}

async function captureUseAuth(options?: { provideAuth?: unknown }) {
  let result: ReturnType<typeof useAuth> | undefined
  let nuxtAppRef: ReturnType<typeof useNuxtApp> | undefined

  const wrapper = await mountSuspended(defineComponent({
    setup() {
      const nuxtApp = useNuxtApp()
      nuxtAppRef = nuxtApp

      if (options?.provideAuth) {
        nuxtApp.provide('auth', options.provideAuth)
      }

      result = useAuth()
      return () => h('div')
    },
  }))

  wrapper.unmount()

  if (!result || !nuxtAppRef) {
    throw new Error('Failed to capture useAuth() result')
  }

  return {
    result,
    nuxtApp: nuxtAppRef,
  }
}

// Order matters in this file: once provided, `$auth` is readonly on the shared nuxtApp.
// Keep no-client tests first and client-injected test last.
describe('useAuth (Nuxt runtime)', () => {
  let convexAuthMock: UseConvexAuthReturn

  beforeEach(() => {
    convexAuthMock = makeConvexAuthMock()
    mockUseConvexAuth.mockReset()
    mockUseConvexAuth.mockReturnValue(convexAuthMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns useConvexAuth state/methods and client=null when auth client is unavailable', async () => {
    const { result } = await captureUseAuth()

    expect(result.client).toBeNull()
    expect(result.token).toBe(convexAuthMock.token)
    expect(result.user).toBe(convexAuthMock.user)
    expect(result.isAuthenticated).toBe(convexAuthMock.isAuthenticated)
    expect(result.isPending).toBe(convexAuthMock.isPending)
    expect(result.authError).toBe(convexAuthMock.authError)
    expect(result.signOut).toBe(convexAuthMock.signOut)
    expect(result.refreshAuth).toBe(convexAuthMock.refreshAuth)
  })

  it('exposes callable client-only proxies when auth client is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = await captureUseAuth()

    expect(typeof result.signIn.email).toBe('function')
    expect(typeof result.signUp.email).toBe('function')
    expect((result.signIn as unknown as { then?: unknown }).then).toBeUndefined()
    expect((result.signIn.email as unknown as { then?: unknown }).then).toBeUndefined()

    const signInResult = await result.signIn.email({
      email: 'stub@example.com',
      password: 'password123',
    })
    const signUpResult = await result.signUp.email({
      name: 'Stub User',
      email: 'stub@example.com',
      password: 'password123',
    })

    expect(signInResult.data).toBeNull()
    expect(signUpResult.data).toBeNull()
    expect(signInResult.error?.message).toContain('client-only')
    expect(signUpResult.error?.message).toContain('client-only')
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

    const { result, nuxtApp } = await captureUseAuth({ provideAuth: fakeAuthClient })

    expect((nuxtApp as typeof nuxtApp & { $auth?: unknown }).$auth).toBe(fakeAuthClient)
    expect(result.client).toBe(fakeAuthClient)
    expect(result.signIn).toBe(fakeAuthClient.signIn)
    expect(result.signUp).toBe(fakeAuthClient.signUp)

    const signInResult = await result.signIn.email({
      email: 'stub@example.com',
      password: 'password123',
    })

    expect(fakeAuthClient.signIn.email).toHaveBeenCalledTimes(1)
    expect(signInResult).toEqual({ data: { ok: true, kind: 'signIn' }, error: null })
  })
})
