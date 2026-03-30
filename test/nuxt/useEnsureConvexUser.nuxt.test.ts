import { describe, expect, it } from 'vitest'

import { useEnsureConvexUser } from '../../src/runtime/composables/useEnsureConvexUser'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'
import { installMockAuthEngine } from '../harness/nuxt-auth-engine'

const mutation = mockFnRef<'mutation'>('auth:createUserIfNeeded')

describe('useEnsureConvexUser (Nuxt runtime)', () => {
  it('calls the mutation only after auth becomes active', async () => {
    const convex = new MockConvexClient()
    convex.setMutationHandler('auth:createUserIfNeeded', async () => ({ ok: true }))

    const { result } = await captureInNuxt(() => {
      const auth = installMockAuthEngine({
        initialToken: null,
        initialUser: null,
        initialPending: false,
      })

      return {
        auth,
        ensure: useEnsureConvexUser(mutation),
      }
    }, { convex })

    expect(convex.calls.mutation).toHaveLength(0)

    result.auth.user.value = {
      id: 'user-1',
      name: 'Auth User',
      email: 'auth@example.test',
    }
    result.auth.token.value = 'jwt.token'

    await waitFor(() => convex.calls.mutation.length === 1)
    expect(result.ensure.ensured.value).toBe(true)
    expect(result.ensure.error.value).toBeNull()
  })

  it('clears duplicate bootstrap races but preserves the ensured state', async () => {
    const convex = new MockConvexClient()
    convex.setMutationHandler('auth:createUserIfNeeded', async () => {
      throw new Error('User already exists')
    })

    const { result } = await captureInNuxt(() => {
      const auth = installMockAuthEngine({
        initialToken: 'jwt.token',
        initialUser: {
          id: 'user-1',
          name: 'Auth User',
          email: 'auth@example.test',
        },
        initialPending: false,
      })

      return {
        auth,
        ensure: useEnsureConvexUser(mutation),
      }
    }, { convex })

    await waitFor(() => convex.calls.mutation.length === 1)
    expect(result.ensure.ensured.value).toBe(true)
    expect(result.ensure.error.value).toBeNull()
    expect(result.ensure.pending.value).toBe(false)
  })
})
