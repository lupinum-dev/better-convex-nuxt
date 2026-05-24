import { describe, expect, it } from 'vitest'
import { computed } from 'vue'

import { useRouter } from '#imports'

import { setupConfiguredAuthBootstrap } from '../../src/runtime/auth/client/auth-bootstrap'
import { useBetterAuthActions } from '../../src/runtime/auth/composables/useBetterAuthActions'
import { useConvexAuth } from '../../src/runtime/auth/composables/useConvexAuth'
import { createConvexQueryState } from '../../src/runtime/convex/query/query-runtime'
import { useAuthBootstrapDevtoolsState } from '../../src/runtime/devtools/state'
import { ConvexCallError } from '../../src/runtime/utils/call-result'
import { installMockAuthEngine } from '../support/auth/nuxt-auth-engine'
import { MockConvexClient, mockFnRef } from '../support/nuxt/mock-convex-client'
import { captureInNuxt } from '../support/nuxt/runtime-harness'
import { waitFor } from '../support/nuxt/wait-for'

const AUTH_USER = {
  displayName: 'Auth User',
  email: 'auth@test.com',
}
const ENSURE_USER_MUTATION = mockFnRef<'mutation'>('auth:createUserIfNeeded')
const TODOS_QUERY = mockFnRef<'query'>('todos:list')

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

describe('useBetterAuthActions (Nuxt runtime)', () => {
  it('happy path: execute calls fn, refreshAuth, and returns result', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useBetterAuthActions()
    })

    const fnResult = await result.execute(async () => ({
      data: { user: { id: 'u1' } },
      error: null,
    }))

    expect(fnResult).toEqual({ data: { user: { id: 'u1' } }, error: null })
    expect(result.error.value).toBeNull()
    expect(result.pending.value).toBe(false)
    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual({ data: { user: { id: 'u1' } }, error: null })
  })

  it('sets pending=true during execution', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useBetterAuthActions()
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
      return useBetterAuthActions()
    })

    const authResponse = await result.execute(async () => ({
      data: { session: { token: 'abc' }, user: { displayName: 'Test' } },
      error: null,
    }))

    if (!authResponse) {
      throw new Error('Expected auth response')
    }
    expect(authResponse.data.user.displayName).toBe('Test')
    expect(authResponse.data.session.token).toBe('abc')
  })

  it('clears previous error on new execute call', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useBetterAuthActions()
    })

    await result.execute(async () => {
      throw new Error('first failure')
    })
    expect(result.error.value).not.toBeNull()

    await result.execute(async () => ({ data: 'ok', error: null }))
    expect(result.error.value).toBeNull()
    expect(result.data.value).toEqual({ data: 'ok', error: null })
  })

  it('detects Better Auth { error } response and sets error.value', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useBetterAuthActions()
    })

    await result.execute(async () => ({
      data: null,
      error: { message: 'Invalid credentials', status: 401, code: 'INVALID_CREDENTIALS' },
    }))

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
      return useBetterAuthActions()
    })

    await result.execute(async () => {
      throw new Error('Network failure')
    })

    expect(result.error.value).toBeInstanceOf(ConvexCallError)
    expect(result.error.value!.message).toBe('Network failure')
  })

  it('sets pending=false when execute fails', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useBetterAuthActions()
    })

    await result.execute(async () => {
      throw new Error('boom')
    })

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
            user: { displayName: 'Unexpected User', email: 'unexpected@test.com' },
            error: null,
            source: 'exchange',
          }
        },
      })
      return useBetterAuthActions()
    })

    await result.execute(async () => ({
      data: null,
      error: { message: 'Bad creds', status: 401 },
    }))

    expect(refreshCallCount).toBe(0)
  })

  it('reset clears data and error and returns to idle', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine()
      return useBetterAuthActions()
    })

    await result.execute(async () => ({ data: 'ok', error: null }))
    expect(result.status.value).toBe('success')

    result.reset()

    expect(result.status.value).toBe('idle')
    expect(result.error.value).toBeNull()
    expect(result.data.value).toBeUndefined()
  })

  it('fails the auth action when post-action refreshAuth fails', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine({
        fetchAuthState: async (_input) => ({
          token: null,
          user: null,
          error: 'Token refresh failed',
          source: 'exchange',
        }),
      })
      return useBetterAuthActions()
    })

    await expect(
      result.execute(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    ).resolves.toBeUndefined()

    expect(result.status.value).toBe('error')
    expect(result.error.value).toBeInstanceOf(ConvexCallError)
    expect(result.pending.value).toBe(false)
    expect(result.data.value).toBeUndefined()
  })

  it('allows a successful auth action to settle anonymous after refresh without treating it as an error', async () => {
    const { result } = await captureInNuxt(() => {
      initAuthEngine({
        initialToken: 'stale.jwt.token',
        initialUser: { displayName: 'Stale User', email: 'stale@test.com' },
        fetchAuthState: async (_input) => ({
          token: null,
          user: null,
          error: null,
          source: 'exchange',
        }),
      })
      return useBetterAuthActions()
    })

    await expect(
      result.execute(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    ).resolves.toEqual({ data: { user: { id: 'u1' } }, error: null })

    expect(result.error.value).toBeNull()
    expect(result.pending.value).toBe(false)
    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual({ data: { user: { id: 'u1' } }, error: null })
  })

  it('covers the auth action -> ensure user -> query subscribe -> sign out flow', async () => {
    const convex = new MockConvexClient()
    convex.setMutationHandler('auth:createUserIfNeeded', async () => ({ ok: true }))

    const { result, flush } = await captureInNuxt(
      () => {
        installMockAuthEngine({
          fetchAuthState: async (_input) => ({
            token: 'refreshed.jwt.token',
            user: AUTH_USER,
            error: null,
            source: 'exchange',
          }),
        })

        const auth = useConvexAuth()
        const actions = useBetterAuthActions()
        setupConfiguredAuthBootstrap(ENSURE_USER_MUTATION, 'auth.createUserIfNeeded')
        const bootstrap = useAuthBootstrapDevtoolsState()
        const todoArgs = computed(() =>
          auth.isAuthenticated.value && bootstrap.value.ensured ? {} : undefined,
        )
        const todos = createConvexQueryState(TODOS_QUERY, todoArgs, {}, true).resultData

        return { auth, actions, bootstrap, todos }
      },
      { convex },
    )

    expect(result.auth.isAuthenticated.value).toBe(false)
    expect(result.bootstrap.value.ensured).toBe(false)
    expect(convex.activeListenerCount(TODOS_QUERY, {})).toBe(0)

    await expect(
      result.actions.execute(async () => ({ data: { user: { id: 'u-auth' } }, error: null })),
    ).resolves.toEqual({ data: { user: { id: 'u-auth' } }, error: null })

    await waitFor(() => result.auth.isAuthenticated.value === true)
    await waitFor(() => convex.calls.mutation.length === 1)
    await waitFor(() => result.bootstrap.value.ensured === true)
    await flush()
    await waitFor(() => convex.calls.onUpdate.some((call) => call.query === TODOS_QUERY))

    convex.emitQueryResult(TODOS_QUERY, {}, [{ _id: 't1', title: 'First todo' }])
    await waitFor(() => result.todos.data.value?.length === 1)

    expect(result.todos.data.value).toEqual([{ _id: 't1', title: 'First todo' }])
    expect(result.todos.pending.value).toBe(false)

    await result.auth.signOut()
    await flush()

    await waitFor(() => result.auth.isAnonymous.value === true)
    await waitFor(() => convex.activeListenerCount() === 0)
    expect(result.bootstrap.value.ensured).toBe(false)
    expect(result.todos.data.value).toBeNull()
  })

  it.each([
    'https://evil.example.com',
    '//evil.example.com',
    '/\\\\evil.example.com',
    'javascript:alert(1)',
    'data:text/html,<h1>evil</h1>',
  ])('falls back to the safe redirect target for unsafe redirect query %s', async (redirect) => {
    const { result, flush } = await captureInNuxt(
      () => {
        initAuthEngine()
        const router = useRouter()
        return {
          router,
          actions: useBetterAuthActions(),
        }
      },
      {
        convexConfig: {
          auth: {
            routeProtection: {
              redirectTo: '/auth/signin',
            },
          },
        },
      },
    )

    await result.router.push(`/auth/signin?redirect=${encodeURIComponent(redirect)}`)
    await flush()

    await result.actions.execute(async () => ({ data: 'ok', error: null }), {
      redirectTo: '/dashboard',
    })
    await flush()

    expect(result.router.currentRoute.value.fullPath).toBe('/dashboard')
  })

  it('falls back to the safe redirect target for nested hostile redirect values', async () => {
    const { result, flush } = await captureInNuxt(
      () => {
        initAuthEngine()
        const router = useRouter()
        return {
          router,
          actions: useBetterAuthActions(),
        }
      },
      {
        convexConfig: {
          auth: {
            routeProtection: {
              redirectTo: '/auth/signin',
            },
          },
        },
      },
    )

    await result.router.push(
      '/auth/signin?redirect=%2Fauth%2Fsignin%3Fredirect%3Dhttps%3A%2F%2Fevil.example.com',
    )
    await flush()

    await result.actions.execute(async () => ({ data: 'ok', error: null }), {
      redirectTo: '/dashboard',
    })
    await flush()

    expect(result.router.currentRoute.value.fullPath).toBe('/dashboard')
  })

  it('preserves a valid internal redirect query after a successful auth action', async () => {
    const { result, flush } = await captureInNuxt(
      () => {
        initAuthEngine()
        const router = useRouter()
        return {
          router,
          actions: useBetterAuthActions(),
        }
      },
      {
        convexConfig: {
          auth: {
            routeProtection: {
              redirectTo: '/auth/signin',
            },
          },
        },
      },
    )

    await result.router.push('/auth/signin?redirect=%2Fdashboard%3Ftab%3Dteam')
    await flush()

    await result.actions.execute(async () => ({ data: 'ok', error: null }), {
      redirectTo: '/fallback',
    })
    await flush()

    expect(result.router.currentRoute.value.fullPath).toBe('/dashboard?tab=team')
  })
})
