import { describe, expect, it } from 'vitest'

import { setupConfiguredAuthBootstrap } from '../../src/runtime/auth/client/auth-bootstrap'
import { useAuthBootstrapDevtoolsState } from '../../src/runtime/devtools/state'
import { installMockAuthEngine } from '../support/auth/nuxt-auth-engine'
import { MockConvexClient, mockFnRef } from '../support/nuxt/mock-convex-client'
import { captureInNuxt } from '../support/nuxt/runtime-harness'
import { waitFor } from '../support/nuxt/wait-for'

const mutation = mockFnRef<'mutation'>('auth:createUserIfNeeded')

describe('configured auth bootstrap (Nuxt runtime)', () => {
  it('calls the configured mutation only after auth becomes active', async () => {
    const convex = new MockConvexClient()
    convex.setMutationHandler('auth:createUserIfNeeded', async () => ({ ok: true }))

    const { result } = await captureInNuxt(
      () => {
        const auth = installMockAuthEngine({
          initialToken: null,
          initialUser: null,
          initialPending: false,
        })
        setupConfiguredAuthBootstrap(mutation, 'auth.createUserIfNeeded')

        return {
          auth,
          bootstrap: useAuthBootstrapDevtoolsState(),
        }
      },
      { convex },
    )

    expect(convex.calls.mutation).toHaveLength(0)

    result.auth.user.value = {
      displayName: 'Auth User',
      email: 'auth@example.test',
    }
    result.auth.token.value = 'jwt.token'

    await waitFor(() => convex.calls.mutation.length === 1)
    expect(result.bootstrap.value.ensured).toBe(true)
    expect(result.bootstrap.value.error).toBeNull()
  })

  it('fails closed when the bootstrap mutation errors', async () => {
    const convex = new MockConvexClient()
    convex.setMutationHandler('auth:createUserIfNeeded', async () => {
      throw new Error('User already exists')
    })

    const { result } = await captureInNuxt(
      () => {
        installMockAuthEngine({
          initialToken: 'jwt.token',
          initialUser: {
            displayName: 'Auth User',
            email: 'auth@example.test',
          },
          initialPending: false,
        })
        setupConfiguredAuthBootstrap(mutation, 'auth.createUserIfNeeded')

        return {
          bootstrap: useAuthBootstrapDevtoolsState(),
        }
      },
      { convex },
    )

    await waitFor(() => convex.calls.mutation.length === 1)
    expect(result.bootstrap.value.ensured).toBe(false)
    expect(result.bootstrap.value.error).toBe('User already exists')
    expect(result.bootstrap.value.pending).toBe(false)
  })

  it('fails closed when the Convex client is unavailable', async () => {
    const { result } = await captureInNuxt(
      () => {
        const auth = installMockAuthEngine({
          initialToken: null,
          initialUser: null,
          initialPending: false,
        })
        setupConfiguredAuthBootstrap(mutation, 'auth.createUserIfNeeded')

        return {
          auth,
          bootstrap: useAuthBootstrapDevtoolsState(),
        }
      },
      { convex: {} },
    )

    result.auth.user.value = {
      displayName: 'Auth User',
      email: 'auth@example.test',
    }
    result.auth.token.value = 'jwt.token'

    await waitFor(() => result.bootstrap.value.error !== null)
    expect(result.bootstrap.value.ensured).toBe(false)
    expect(result.bootstrap.value.pending).toBe(false)
    expect(result.bootstrap.value.error).toBe('Convex client is not initialized.')
  })
})
