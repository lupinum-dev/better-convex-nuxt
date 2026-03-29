import { describe, expect, it } from 'vitest'

import { useConvexAuthActions } from '../../src/runtime/composables/useConvexAuthActions'
import { ConvexCallError } from '../../src/runtime/utils/call-result'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { installMockAuthEngine } from '../harness/nuxt-auth-engine'

const AUTH_USER = {
  id: 'u-auth',
  name: 'Auth User',
  email: 'auth@test.com',
}

function initAuthEngine(options?: Parameters<typeof installMockAuthEngine>[0]) {
  installMockAuthEngine({
    fetchAuthState: async (_input) => ({
      token: 'refreshed.jwt.token',
      user: AUTH_USER,
      error: null,
      source: 'exchange',
    }),
    ...options,
  })
}

describe('useConvexAuthActions (Nuxt runtime)', () => {
  it('happy path: execute calls fn, refreshAuth, and returns result', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useConvexAuthActions()
    })

    const fnResult = await result.execute(
      async () => ({ data: { user: { id: 'u1' } }, error: null }),
    )

    expect(fnResult).toEqual({ data: { user: { id: 'u1' } }, error: null })
    expect(result.error.value).toBeNull()
    expect(result.pending.value).toBe(false)
    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual({ data: { user: { id: 'u1' } }, error: null })
  })

  it('sets pending=true during execution', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useConvexAuthActions()
    })

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
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useConvexAuthActions()
    })

    const authResponse = await result.execute(async () => ({
      data: { session: { token: 'abc' }, user: { id: 'u1', name: 'Test' } },
      error: null,
    }))

    expect(authResponse.data.user.name).toBe('Test')
    expect(authResponse.data.session.token).toBe('abc')
  })

  it('clears previous error on new execute call', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useConvexAuthActions()
    })

    await expect(
      result.execute(async () => {
        throw new Error('first failure')
      }),
    ).rejects.toThrow()
    expect(result.error.value).not.toBeNull()

    await result.execute(async () => ({ data: 'ok', error: null }))
    expect(result.error.value).toBeNull()
    expect(result.data.value).toEqual({ data: 'ok', error: null })
  })

  it('detects Better Auth { error } response and throws ConvexCallError', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useConvexAuthActions()
    })

    await expect(
      result.execute(async () => ({
        data: null,
        error: { message: 'Invalid credentials', status: 401, code: 'INVALID_CREDENTIALS' },
      })),
    ).rejects.toThrow(ConvexCallError)

    expect(result.error.value).toBeInstanceOf(ConvexCallError)
    const convexError = result.error.value as ConvexCallError
    expect(convexError.message).toBe('Invalid credentials')
    expect(convexError.status).toBe(401)
    expect(convexError.category).toBe('auth')
    expect(result.status.value).toBe('error')
  })

  it('wraps non-ConvexCallError thrown by fn', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useConvexAuthActions()
    })

    await expect(
      result.execute(async () => {
        throw new Error('Network failure')
      }),
    ).rejects.toThrow(ConvexCallError)

    expect(result.error.value).toBeInstanceOf(ConvexCallError)
    expect(result.error.value!.message).toBe('Network failure')
  })

  it('sets pending=false even when execute throws', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useConvexAuthActions()
    })

    await expect(
      result.execute(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow()

    expect(result.pending.value).toBe(false)
  })

  it('does not call refreshAuth when Better Auth error is detected', async () => {
    let refreshCallCount = 0

    const { result } = await captureInNuxt(() => {
      initAuthEngine({
        fetchAuthState: async (_input) => {
          refreshCallCount++
          return {
            token: 'should-not-be-set',
            user: { id: 'unexpected', name: 'Unexpected User', email: 'unexpected@test.com' },
            error: null,
            source: 'exchange',
          }
        },
      })
      return useConvexAuthActions()
    })

    await expect(
      result.execute(async () => ({
        data: null,
        error: { message: 'Bad creds', status: 401 },
      })),
    ).rejects.toThrow()

    expect(refreshCallCount).toBe(0)
  })

  it('reset clears data and error and returns to idle', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useConvexAuthActions()
    })

    await result.execute(async () => ({ data: 'ok', error: null }))
    expect(result.status.value).toBe('success')

    result.reset()

    expect(result.status.value).toBe('idle')
    expect(result.error.value).toBeNull()
    expect(result.data.value).toBeUndefined()
  })

  it('wraps refreshAuth failure as ConvexCallError', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine({
        fetchAuthState: async (_input) => ({
          token: null,
          user: null,
          error: 'Token refresh failed',
          source: 'exchange',
        }),
      })
      return useConvexAuthActions()
    })

    await expect(
      result.execute(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    ).rejects.toThrow(ConvexCallError)

    expect(result.error.value).toBeInstanceOf(ConvexCallError)
    expect(result.error.value!.message).toBe('Token refresh failed')
    expect(result.pending.value).toBe(false)
  })
})
