import { describe, expect, it, vi } from 'vitest'

import { useNuxtApp, useState } from '#imports'

import type {
  AuthTransport,
  ClientAuthStateResult,
} from '../../src/runtime/auth/client/auth-engine'
import { useConvexAuth } from '../../src/runtime/auth/composables/useConvexAuth'
import { useConvexAuthController } from '../../src/runtime/auth/internal/useConvexAuthController'
import { installMockAuthEngine } from '../support/auth/nuxt-auth-engine'
import { captureInNuxt } from '../support/nuxt/runtime-harness'
import { createDeferred } from '../support/unit/deferred'

const AUTH_USER = {
  displayName: 'Auth User',
  email: 'auth@test.com',
}

function buildMockTransport(options?: {
  fetchAuthState?: (input: {
    forceRefreshToken: boolean
    signal?: AbortSignal
  }) => Promise<ClientAuthStateResult>
  invalidate?: () => Promise<void>
}) {
  const transport: AuthTransport = {
    client: {
      signOut: async () => {},
    } as never,
    fetchAuthState:
      options?.fetchAuthState ??
      (async (_input) => ({
        token: 'refreshed.jwt.token',
        user: AUTH_USER,
        error: null,
        source: 'exchange',
      })),
    install() {},
    async refresh(fetchToken, onChange) {
      const nextToken = await fetchToken({ forceRefreshToken: true })
      onChange(Boolean(nextToken))
    },
    async invalidate() {
      await options?.invalidate?.()
    },
  }

  return transport
}

describe('useConvexAuthController (Nuxt runtime)', () => {
  it('refreshAuth resolves after the shared auth engine commits the refreshed token', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine({
        fetchAuthState: async (_input) => ({
          token: 'new.jwt.token',
          user: { displayName: 'User Two', email: 'u2@test.com' },
          error: null,
          source: 'exchange',
        }),
      })

      return { auth: useConvexAuth(), internal: useConvexAuthController() }
    })

    await result.internal.refreshAuth()
    expect(result.internal.token.value).toBe('new.jwt.token')
    expect(result.auth.sessionUser.value).toEqual({ displayName: 'User Two', email: 'u2@test.com' })
    expect(result.auth.isAuthenticated.value).toBe(true)
    expect(result.auth.isPending.value).toBe(false)
  })

  it('refreshAuth resolves cleanly when refresh settles unauthenticated without an error', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine({
        initialToken: 'stale.jwt.token',
        initialUser: { displayName: 'Stale User', email: 'stale@test.com' },
        fetchAuthState: async (_input) => ({
          token: null,
          user: null,
          error: null,
          source: 'exchange',
        }),
      })

      return { auth: useConvexAuth(), internal: useConvexAuthController() }
    })

    await expect(result.internal.refreshAuth()).resolves.toBeUndefined()
    expect(result.internal.token.value).toBeNull()
    expect(result.auth.sessionUser.value).toBeNull()
    expect(result.auth.isAuthenticated.value).toBe(false)
    expect(result.auth.authError.value).toBeNull()
    expect(result.auth.isPending.value).toBe(false)
  })

  it('refreshAuth rejects when refresh settles unauthenticated with an explicit error', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine({
        initialToken: 'stale.jwt.token',
        initialUser: { displayName: 'Stale User', email: 'stale@test.com' },
        fetchAuthState: async (_input) => ({
          token: null,
          user: null,
          error: 'refresh exchange failed',
          source: 'exchange',
        }),
      })

      return { auth: useConvexAuth(), internal: useConvexAuthController() }
    })

    await expect(result.internal.refreshAuth()).rejects.toThrow('refresh exchange failed')
    expect(result.internal.token.value).toBeNull()
    expect(result.auth.sessionUser.value).toBeNull()
    expect(result.auth.isAuthenticated.value).toBe(false)
    expect(result.auth.authError.value?.message).toBe('refresh exchange failed')
    expect(result.auth.isPending.value).toBe(false)
  })

  it('awaitAuthReady resolves final auth state without throwing', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine({
        initialPending: true,
      })

      const pending = useState<boolean>('convex:pending')
      const token = useState<string | null>('convex:token')
      const user = useState<{ email: string } | null>('convex:user')

      setTimeout(() => {
        token.value = 'ready.jwt.token'
        user.value = { email: 'ready@test.com' }
        pending.value = false
      }, 10)

      return { auth: useConvexAuth(), internal: useConvexAuthController() }
    })

    await expect(result.internal.awaitAuthReady({ timeoutMs: 200 })).resolves.toBe(true)
    expect(result.auth.isAuthenticated.value).toBe(true)
  })

  it('awaitAuthReady returns false when pending does not settle before timeout', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine({
        initialPending: true,
      })
      return useConvexAuthController()
    })

    await expect(result.awaitAuthReady({ timeoutMs: 5 })).resolves.toBe(false)
  })

  it('emits trellis:auth:changed through the real Nuxt hook system on refresh', async () => {
    const hookPayloads: unknown[] = []

    const { result } = await captureInNuxt(() => {
      const nuxtApp = useNuxtApp()
      installMockAuthEngine({
        fetchAuthState: async (_input) => ({
          token: 'hook-test.jwt.token',
          user: { displayName: 'Hook User', email: 'hook@test.com' },
          error: null,
          source: 'exchange',
        }),
      })

      nuxtApp.hook(
        'trellis:auth:changed' as never,
        ((payload: unknown) => {
          hookPayloads.push(payload)
        }) as never,
      )

      return useConvexAuthController()
    })

    await result.refreshAuth()

    expect(hookPayloads).toHaveLength(1)
    expect(hookPayloads[0]).toMatchObject({
      isAuthenticated: true,
      previousIsAuthenticated: false,
    })
  })

  it('signOut fails closed even when transport.invalidate() throws', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine({
        initialToken: 'active.jwt.token',
        initialUser: { displayName: 'Active User', email: 'active@test.com' },
        invalidate: async () => {
          throw new Error('invalidate failed')
        },
      })

      return useConvexAuthController()
    })

    expect(result.isAuthenticated.value).toBe(true)
    await expect(result.signOut()).rejects.toThrow('invalidate failed')
    expect(result.isAuthenticated.value).toBe(false)
    expect(result.token.value).toBeNull()
    expect(result.user.value).toBeNull()
  })

  it('does not call onCommit for a stale refresh result', async () => {
    const onCommit = vi.fn()
    const deferredResult = createDeferred<ClientAuthStateResult>()

    const { result, flush } = await captureInNuxt(() => {
      const installed = installMockAuthEngine({
        fetchAuthState: async () => await deferredResult.promise,
      })

      return installed
    })

    const refreshPromise = result.engine.refreshAuth()
    await Promise.resolve()

    const invalidatePromise = result.engine.invalidateAuth({ clearWasAuthenticated: true })

    deferredResult.resolve({
      token: 'stale.jwt.token',
      user: { displayName: 'Stale User', email: 'stale@test.com' },
      error: null,
      source: 'exchange',
      onCommit,
    })

    await Promise.allSettled([refreshPromise, invalidatePromise])
    await flush()

    expect(onCommit).not.toHaveBeenCalled()
    expect(result.engine.isAuthenticated.value).toBe(false)
    expect(result.token.value).toBeNull()
    expect(result.user.value).toBeNull()
  })

  it('configureTransport invalidates an in-flight refresh from the previous transport', async () => {
    const oldOnCommit = vi.fn()
    const deferredResult = createDeferred<ClientAuthStateResult>()

    const { result, flush } = await captureInNuxt(() => {
      const installed = installMockAuthEngine({
        fetchAuthState: async () => await deferredResult.promise,
      })

      return installed
    })

    const nextTransport = buildMockTransport({
      fetchAuthState: async (_input) => ({
        token: 'fresh.jwt.token',
        user: { displayName: 'Fresh User', email: 'fresh@test.com' },
        error: null,
        source: 'exchange',
      }),
    })

    const refreshPromise = result.engine.refreshAuth()
    await Promise.resolve()

    result.engine.configureTransport(nextTransport)

    deferredResult.resolve({
      token: 'stale.jwt.token',
      user: { displayName: 'Stale User', email: 'stale@test.com' },
      error: null,
      source: 'exchange',
      onCommit: oldOnCommit,
    })

    await refreshPromise
    await flush()

    expect(oldOnCommit).not.toHaveBeenCalled()
    expect(result.engine.isAuthenticated.value).toBe(false)
    expect(result.token.value).toBeNull()

    await result.engine.refreshAuth()
    await flush()

    expect(result.token.value).toBe('fresh.jwt.token')
    expect(result.user.value).toEqual({
      displayName: 'Fresh User',
      email: 'fresh@test.com',
    })
  })

  it('exposes token, authError, refreshAuth, and awaitAuthReady without a pre-seeded error', async () => {
    const { result } = await captureInNuxt(() => {
      installMockAuthEngine()
      return useConvexAuthController()
    })

    expect('token' in result).toBe(true)
    expect('authError' in result).toBe(true)
    expect('refreshAuth' in result).toBe(true)
    expect('awaitAuthReady' in result).toBe(true)
    expect(result.authError.value).toBeNull()
  })
})
