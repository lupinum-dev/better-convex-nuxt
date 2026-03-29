import { describe, expect, it, vi } from 'vitest'

import { useNuxtApp, useState } from '#imports'

import { useConvexAction } from '../../src/runtime/composables/useConvexAction'
import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import { useConvexConnectionState } from '../../src/runtime/composables/useConvexConnectionState'
import { useConvexMutation } from '../../src/runtime/composables/useConvexMutation'
import { ConvexCallError } from '../../src/runtime/utils/call-result'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

describe('global hooks (Nuxt runtime)', () => {
  // -----------------------------------------------------------------------
  // Mutation hooks
  // -----------------------------------------------------------------------
  describe('mutation hooks', () => {
    it('fires convex:mutation:success with correct payload', async () => {
      const convex = new MockConvexClient()
      const mutation = mockFnRef<'mutation'>('testing:hook-success')
      convex.setMutationHandler('testing:hook-success', async (args) => ({
        id: 'new',
        ...(args as Record<string, unknown>),
      }))

      const hookSpy = vi.fn()

      const { result, nuxtApp } = await captureInNuxt(
        () => useConvexMutation(mutation),
        { convex },
      )

      nuxtApp.hook('convex:mutation:success', hookSpy)

      await result({ title: 'Test' } as never)

      expect(hookSpy).toHaveBeenCalledTimes(1)
      const payload = hookSpy.mock.calls[0]![0]
      expect(payload.functionPath).toBe('testing:hook-success')
      expect(payload.operation).toBe('mutation')
      expect(payload.args).toEqual({ title: 'Test' })
      expect(payload.result).toEqual({ id: 'new', title: 'Test' })
      expect(typeof payload.duration).toBe('number')
    })

    it('fires convex:mutation:error with ConvexCallError', async () => {
      const convex = new MockConvexClient()
      const mutation = mockFnRef<'mutation'>('testing:hook-fail')
      convex.setMutationHandler('testing:hook-fail', async () => {
        throw new Error('boom')
      })

      const hookSpy = vi.fn()

      const { result, nuxtApp } = await captureInNuxt(
        () => useConvexMutation(mutation),
        { convex },
      )

      nuxtApp.hook('convex:mutation:error', hookSpy)

      await expect(result({} as never)).rejects.toThrow('boom')

      expect(hookSpy).toHaveBeenCalledTimes(1)
      const payload = hookSpy.mock.calls[0]![0]
      expect(payload.functionPath).toBe('testing:hook-fail')
      expect(payload.operation).toBe('mutation')
      expect(payload.error).toBeInstanceOf(ConvexCallError)
      expect(payload.error.message).toBe('boom')
      expect(typeof payload.duration).toBe('number')
    })

    it('includes error category in hook payload', async () => {
      const convex = new MockConvexClient()
      const mutation = mockFnRef<'mutation'>('testing:hook-auth-fail')
      convex.setMutationHandler('testing:hook-auth-fail', async () => {
        const err = new Error('Unauthorized') as Error & { data?: unknown }
        err.data = { message: 'Unauthorized', code: 'UNAUTHENTICATED', status: 401 }
        throw err
      })

      const hookSpy = vi.fn()

      const { result, nuxtApp } = await captureInNuxt(
        () => useConvexMutation(mutation),
        { convex },
      )

      nuxtApp.hook('convex:mutation:error', hookSpy)

      await expect(result({} as never)).rejects.toThrow()

      const payload = hookSpy.mock.calls[0]![0]
      expect(payload.error.category).toBe('auth')
      expect(payload.error.isRecoverable).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // Action hooks
  // -----------------------------------------------------------------------
  describe('action hooks', () => {
    it('fires convex:action:success with correct payload', async () => {
      const convex = new MockConvexClient()
      const action = mockFnRef<'action'>('testing:action-hook-success')
      convex.setActionHandler('testing:action-hook-success', async (args) => ({
        sent: true,
        ...(args as Record<string, unknown>),
      }))

      const hookSpy = vi.fn()

      const { result, nuxtApp } = await captureInNuxt(
        () => useConvexAction(action),
        { convex },
      )

      nuxtApp.hook('convex:action:success', hookSpy)

      await result({ to: 'user@test.com' } as never)

      expect(hookSpy).toHaveBeenCalledTimes(1)
      const payload = hookSpy.mock.calls[0]![0]
      expect(payload.functionPath).toBe('testing:action-hook-success')
      expect(payload.operation).toBe('action')
      expect(payload.args).toEqual({ to: 'user@test.com' })
      expect(payload.result).toEqual({ sent: true, to: 'user@test.com' })
    })

    it('fires convex:action:error with ConvexCallError', async () => {
      const convex = new MockConvexClient()
      const action = mockFnRef<'action'>('testing:action-hook-fail')
      convex.setActionHandler('testing:action-hook-fail', async () => {
        throw new Error('action boom')
      })

      const hookSpy = vi.fn()

      const { result, nuxtApp } = await captureInNuxt(
        () => useConvexAction(action),
        { convex },
      )

      nuxtApp.hook('convex:action:error', hookSpy)

      await expect(result({} as never)).rejects.toThrow('action boom')

      expect(hookSpy).toHaveBeenCalledTimes(1)
      const payload = hookSpy.mock.calls[0]![0]
      expect(payload.functionPath).toBe('testing:action-hook-fail')
      expect(payload.operation).toBe('action')
      expect(payload.error).toBeInstanceOf(ConvexCallError)
      expect(payload.error.message).toBe('action boom')
    })
  })

  // -----------------------------------------------------------------------
  // Multiple listeners
  // -----------------------------------------------------------------------
  describe('multiple listeners', () => {
    it('notifies all registered listeners', async () => {
      const convex = new MockConvexClient()
      const mutation = mockFnRef<'mutation'>('testing:multi-listener')
      convex.setMutationHandler('testing:multi-listener', async () => 'ok')

      const listener1 = vi.fn()
      const listener2 = vi.fn()

      const { result } = await captureInNuxt(
        () => {
          const nuxt = useNuxtApp()
          nuxt.hook('convex:mutation:success', listener1)
          nuxt.hook('convex:mutation:success', listener2)
          return useConvexMutation(mutation)
        },
        { convex },
      )

      await result({} as never)

      // Allow fire-and-forget callHook to resolve
      await new Promise(r => setTimeout(r, 10))

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // Local callbacks + global hooks coexist
  // -----------------------------------------------------------------------
  describe('callback and hook coexistence', () => {
    it('fires both local onSuccess and global hook', async () => {
      const convex = new MockConvexClient()
      const mutation = mockFnRef<'mutation'>('testing:both-callbacks')
      convex.setMutationHandler('testing:both-callbacks', async () => ({ ok: true }))

      const onSuccess = vi.fn()
      const hookSpy = vi.fn()

      const { result, nuxtApp } = await captureInNuxt(
        () => useConvexMutation(mutation, { onSuccess }),
        { convex },
      )

      nuxtApp.hook('convex:mutation:success', hookSpy)

      await result({} as never)
      // Success hooks are fire-and-forget (void callHook) — wait for the floating promise
      await new Promise(r => setTimeout(r, 10))

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(hookSpy).toHaveBeenCalledTimes(1)
    })

    it('fires both local onError and global hook on failure', async () => {
      const convex = new MockConvexClient()
      const mutation = mockFnRef<'mutation'>('testing:both-error-callbacks')
      convex.setMutationHandler('testing:both-error-callbacks', async () => {
        throw new Error('dual fail')
      })

      const onError = vi.fn()
      const hookSpy = vi.fn()

      const { result, nuxtApp } = await captureInNuxt(
        () => useConvexMutation(mutation, { onError }),
        { convex },
      )

      nuxtApp.hook('convex:mutation:error', hookSpy)

      await expect(result({} as never)).rejects.toThrow('dual fail')

      expect(onError).toHaveBeenCalledTimes(1)
      expect(hookSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('connection and auth hooks', () => {
    it('registers convex:connection:changed with the expected payload shape', async () => {
      const convex = new MockConvexClient()
      const hookSpy = vi.fn()

      const { wrapper } = await captureInNuxt(() => {
        const nuxtApp = useNuxtApp()
        nuxtApp.hook('convex:connection:changed', hookSpy)
        return useConvexConnectionState()
      }, { convex })

      convex.updateConnectionState({
        isWebSocketConnected: true,
        hasEverConnected: true,
        connectionCount: 1,
      })
      await Promise.resolve()

      expect(hookSpy).toHaveBeenCalledTimes(1)
      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'connected',
          previousState: 'connecting',
          connection: expect.objectContaining({
            isWebSocketConnected: true,
            connectionCount: 1,
          }),
          previousConnection: expect.objectContaining({
            isWebSocketConnected: false,
          }),
        }),
      )

      wrapper.unmount()
    })

    it('registers convex:auth:changed with the expected payload shape', async () => {
      const hookSpy = vi.fn()

      const { result, wrapper } = await captureInNuxt(() => {
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
      await Promise.resolve()

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
  })
})
