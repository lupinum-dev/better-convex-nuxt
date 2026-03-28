import { describe, expect, it } from 'vitest'

import { useNuxtApp, useState } from '#imports'

import { useConvexAuthFlow } from '../../src/runtime/composables/useConvexAuthFlow'
import { ConvexCallError } from '../../src/runtime/utils/call-result'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

const AUTH_CONFIG = {
  auth: { routeProtection: { redirectTo: '/auth/signin' } },
}

/**
 * Set up auth state and a succeeding refresh hook inside captureInNuxt.
 * Must be called inside the factory passed to captureInNuxt.
 */
function initAuthState() {
  const nuxtApp = useNuxtApp()
  const token = useState<string | null>('convex:token')
  const user = useState<Record<string, unknown> | null>('convex:user')
  const authError = useState<string | null>('convex:authError')
  const pending = useState<boolean>('convex:pending')

  token.value = null
  user.value = null
  authError.value = null
  pending.value = false

  nuxtApp.hook('better-convex:auth:refresh', async () => {
    token.value = 'refreshed.jwt.token'
    user.value = { id: 'u-auth' }
  })
}

describe('useConvexAuthFlow (Nuxt runtime)', () => {
  // Tests with success-only refresh hooks come first.
  // Tests that register failing hooks come last, since the shared nuxtApp
  // accumulates hook listeners across tests within the same describe block.

  it('happy path: execute calls fn, refreshAuth, and returns result', async () => {
    const { result } = await captureInNuxt(
      () => {
        initAuthState()
        return useConvexAuthFlow()
      },
      { convexConfig: AUTH_CONFIG },
    )

    const fnResult = await result.execute(
      async () => ({ data: { user: { id: 'u1' } }, error: null }),
    )

    expect(fnResult).toEqual({ data: { user: { id: 'u1' } }, error: null })
    expect(result.error.value).toBeNull()
    expect(result.pending.value).toBe(false)
  })

  it('sets pending=true during execution', async () => {
    const { result } = await captureInNuxt(
      () => {
        initAuthState()
        return useConvexAuthFlow()
      },
      { convexConfig: AUTH_CONFIG },
    )

    const pendingStates: boolean[] = []

    const promise = result.execute(async () => {
      pendingStates.push(result.pending.value)
      return { data: 'ok', error: null }
    })

    await promise
    pendingStates.push(result.pending.value)

    expect(pendingStates[0]).toBe(true)
    expect(pendingStates[1]).toBe(false)
  })

  it('returns the raw result from fn for data access', async () => {
    const { result } = await captureInNuxt(
      () => {
        initAuthState()
        return useConvexAuthFlow()
      },
      { convexConfig: AUTH_CONFIG },
    )

    const authResponse = await result.execute(async () => ({
      data: { session: { token: 'abc' }, user: { id: 'u1', name: 'Test' } },
      error: null,
    }))

    expect(authResponse.data.user.name).toBe('Test')
    expect(authResponse.data.session.token).toBe('abc')
  })

  it('clears previous error on new execute call', async () => {
    const { result } = await captureInNuxt(
      () => {
        initAuthState()
        return useConvexAuthFlow()
      },
      { convexConfig: AUTH_CONFIG },
    )

    // First call fails (fn throws, so refreshAuth is never reached)
    await expect(
      result.execute(async () => {
        throw new Error('first failure')
      }),
    ).rejects.toThrow()
    expect(result.error.value).not.toBeNull()

    // Second call succeeds — error should be cleared
    await result.execute(async () => ({ data: 'ok', error: null }))
    expect(result.error.value).toBeNull()
  })

  it('detects Better Auth { error } response and throws ConvexCallError', async () => {
    const { result } = await captureInNuxt(
      () => {
        initAuthState()
        return useConvexAuthFlow()
      },
      { convexConfig: AUTH_CONFIG },
    )

    await expect(
      result.execute(async () => ({
        data: null,
        error: { message: 'Invalid credentials', status: 401, code: 'INVALID_CREDENTIALS' },
      })),
    ).rejects.toThrow(ConvexCallError)

    expect(result.error.value).toBeInstanceOf(ConvexCallError)
    expect(result.error.value!.message).toBe('Invalid credentials')
    expect(result.error.value!.status).toBe(401)
    expect(result.error.value!.category).toBe('auth')
  })

  it('wraps non-ConvexCallError thrown by fn', async () => {
    const { result } = await captureInNuxt(
      () => {
        initAuthState()
        return useConvexAuthFlow()
      },
      { convexConfig: AUTH_CONFIG },
    )

    await expect(
      result.execute(async () => {
        throw new Error('Network failure')
      }),
    ).rejects.toThrow(ConvexCallError)

    expect(result.error.value).toBeInstanceOf(ConvexCallError)
    expect(result.error.value!.message).toBe('Network failure')
  })

  it('sets pending=false even when execute throws', async () => {
    const { result } = await captureInNuxt(
      () => {
        initAuthState()
        return useConvexAuthFlow()
      },
      { convexConfig: AUTH_CONFIG },
    )

    await expect(
      result.execute(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow()

    expect(result.pending.value).toBe(false)
  })

  it('does not call refreshAuth when Better Auth error is detected', async () => {
    const refreshCalled = { value: false }

    const { result } = await captureInNuxt(
      () => {
        const nuxtApp = useNuxtApp()
        const token = useState<string | null>('convex:token')
        const user = useState<Record<string, unknown> | null>('convex:user')
        const authError = useState<string | null>('convex:authError')
        const pending = useState<boolean>('convex:pending')

        token.value = null
        user.value = null
        authError.value = null
        pending.value = false

        nuxtApp.hook('better-convex:auth:refresh', async () => {
          refreshCalled.value = true
          token.value = 'should-not-be-set'
        })

        return useConvexAuthFlow()
      },
      { convexConfig: AUTH_CONFIG },
    )

    await expect(
      result.execute(async () => ({
        data: null,
        error: { message: 'Bad creds', status: 401 },
      })),
    ).rejects.toThrow()

    expect(refreshCalled.value).toBe(false)
  })

  // This test registers a FAILING refresh hook on the shared nuxtApp.
  // It must come last since the hook persists across subsequent tests.
  it('wraps refreshAuth failure as ConvexCallError', async () => {
    const { result } = await captureInNuxt(
      () => {
        const nuxtApp = useNuxtApp()
        const token = useState<string | null>('convex:token')
        const user = useState<Record<string, unknown> | null>('convex:user')
        const authError = useState<string | null>('convex:authError')
        const pending = useState<boolean>('convex:pending')

        token.value = null
        user.value = null
        authError.value = null
        pending.value = false

        nuxtApp.hook('better-convex:auth:refresh', async () => {
          throw new Error('Token refresh failed')
        })

        return useConvexAuthFlow()
      },
      { convexConfig: AUTH_CONFIG },
    )

    await expect(
      result.execute(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    ).rejects.toThrow(ConvexCallError)

    expect(result.error.value).toBeInstanceOf(ConvexCallError)
    expect(result.error.value!.message).toBe('Token refresh failed')
    expect(result.pending.value).toBe(false)
  })
})
