import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createConvexCallState } from '../../src/runtime/composables/useConvexMutation'
import { ConvexCallError } from '../../src/runtime/utils/call-result'

// ---------------------------------------------------------------------------
// Mock #imports — unit tests don't have a real Nuxt runtime
// ---------------------------------------------------------------------------

vi.mock('#imports', () => ({
  useNuxtApp: vi.fn(),
  useRuntimeConfig: vi.fn(() => ({ public: { convex: {} } })),
}))

// Stub devtools helpers (no-ops in unit context)
vi.mock('../../src/runtime/devtools/runtime', () => ({
  registerDevtoolsEntry: vi.fn(() => 'devtools-id'),
  updateDevtoolsEntrySuccess: vi.fn(),
  updateDevtoolsEntryError: vi.fn(),
}))

// Stub unauthorized handler
vi.mock('../../src/runtime/utils/auth-unauthorized', () => ({
  handleUnauthorizedAuthFailure: vi.fn(),
}))

// Minimal logger that satisfies the Logger interface
function noopLogger() {
  return {
    auth: vi.fn(),
    query: vi.fn(),
    mutation: vi.fn(),
    action: vi.fn(),
    connection: vi.fn(),
    upload: vi.fn(),
  }
}

describe('global hooks (unit)', () => {
  let callHookMock: ReturnType<typeof vi.fn>
  let nuxtApp: { callHook: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    callHookMock = vi.fn(async () => {})
    nuxtApp = { callHook: callHookMock }
  })

  // -----------------------------------------------------------------------
  // Mutation success
  // -----------------------------------------------------------------------
  describe('convex:mutation:success', () => {
    it('fires with correct payload after a successful mutation', async () => {
      const callable = createConvexCallState({
        fnName: 'posts:create',
        callType: 'mutation',
        logger: noopLogger(),
        nuxtApp: nuxtApp as any,
        hasOptimisticUpdate: false,
        callFn: async (args) => ({ id: '1', ...args }),
      })

      await callable({ title: 'Hello' } as never)

      expect(callHookMock).toHaveBeenCalledWith(
        'convex:mutation:success',
        expect.objectContaining({
          functionPath: 'posts:create',
          operation: 'mutation',
          args: { title: 'Hello' },
          result: { id: '1', title: 'Hello' },
        }),
      )
      // Duration is a number >= 0
      const payload = callHookMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'convex:mutation:success',
      )?.[1]
      expect(payload.duration).toBeGreaterThanOrEqual(0)
    })

    it('fires after local onSuccess callback', async () => {
      const callOrder: string[] = []

      const callable = createConvexCallState({
        fnName: 'posts:create',
        callType: 'mutation',
        logger: noopLogger(),
        nuxtApp: nuxtApp as any,
        hasOptimisticUpdate: false,
        callFn: async () => 'ok',
        onSuccess: () => callOrder.push('onSuccess'),
      })

      callHookMock.mockImplementation(async (name: string) => {
        if (name === 'convex:mutation:success') callOrder.push('hook')
      })

      await callable({} as never)
      expect(callOrder).toEqual(['onSuccess', 'hook'])
    })
  })

  // -----------------------------------------------------------------------
  // Mutation error
  // -----------------------------------------------------------------------
  describe('convex:mutation:error', () => {
    it('fires with ConvexCallError after a failed mutation', async () => {
      const callable = createConvexCallState({
        fnName: 'posts:create',
        callType: 'mutation',
        logger: noopLogger(),
        nuxtApp: nuxtApp as any,
        hasOptimisticUpdate: false,
        callFn: async () => {
          throw new Error('mutation failed')
        },
      })

      await expect(callable({ title: 'Bad' } as never)).rejects.toThrow('mutation failed')

      expect(callHookMock).toHaveBeenCalledWith(
        'convex:mutation:error',
        expect.objectContaining({
          functionPath: 'posts:create',
          operation: 'mutation',
          args: { title: 'Bad' },
        }),
      )
      const payload = callHookMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'convex:mutation:error',
      )?.[1]
      expect(payload.error).toBeInstanceOf(ConvexCallError)
      expect(payload.duration).toBeGreaterThanOrEqual(0)
    })

    it('fires after local onError callback', async () => {
      const callOrder: string[] = []

      const callable = createConvexCallState({
        fnName: 'posts:create',
        callType: 'mutation',
        logger: noopLogger(),
        nuxtApp: nuxtApp as any,
        hasOptimisticUpdate: false,
        callFn: async () => {
          throw new Error('fail')
        },
        onError: () => callOrder.push('onError'),
      })

      callHookMock.mockImplementation(async (name: string) => {
        if (name === 'convex:mutation:error') callOrder.push('hook')
      })

      await expect(callable({} as never)).rejects.toThrow()
      expect(callOrder).toEqual(['onError', 'hook'])
    })
  })

  // -----------------------------------------------------------------------
  // Action success
  // -----------------------------------------------------------------------
  describe('convex:action:success', () => {
    it('fires with operation "action"', async () => {
      const callable = createConvexCallState({
        fnName: 'emails:send',
        callType: 'action',
        logger: noopLogger(),
        nuxtApp: nuxtApp as any,
        hasOptimisticUpdate: false,
        callFn: async () => ({ sent: true }),
      })

      await callable({ to: 'user@example.com' } as never)

      expect(callHookMock).toHaveBeenCalledWith(
        'convex:action:success',
        expect.objectContaining({
          functionPath: 'emails:send',
          operation: 'action',
          args: { to: 'user@example.com' },
          result: { sent: true },
        }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // Action error
  // -----------------------------------------------------------------------
  describe('convex:action:error', () => {
    it('fires with operation "action"', async () => {
      const callable = createConvexCallState({
        fnName: 'emails:send',
        callType: 'action',
        logger: noopLogger(),
        nuxtApp: nuxtApp as any,
        hasOptimisticUpdate: false,
        callFn: async () => {
          throw new Error('action failed')
        },
      })

      await expect(callable({} as never)).rejects.toThrow('action failed')

      expect(callHookMock).toHaveBeenCalledWith(
        'convex:action:error',
        expect.objectContaining({
          functionPath: 'emails:send',
          operation: 'action',
        }),
      )
      const payload = callHookMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'convex:action:error',
      )?.[1]
      expect(payload.error).toBeInstanceOf(ConvexCallError)
    })
  })

  // -----------------------------------------------------------------------
  // Error category propagation
  // -----------------------------------------------------------------------
  describe('error category in hook payload', () => {
    it('includes the auto-derived category on the error', async () => {
      const callable = createConvexCallState({
        fnName: 'notes:list',
        callType: 'mutation',
        logger: noopLogger(),
        nuxtApp: nuxtApp as any,
        hasOptimisticUpdate: false,
        callFn: async () => {
          const err = new Error('Unauthorized') as Error & { data?: unknown }
          err.data = { message: 'Unauthorized', code: 'UNAUTHENTICATED', status: 401 }
          throw err
        },
      })

      await expect(callable({} as never)).rejects.toThrow()

      const payload = callHookMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'convex:mutation:error',
      )?.[1]
      expect(payload.error.category).toBe('auth')
      expect(payload.error.isRecoverable).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // Hook errors don't break mutation flow
  // -----------------------------------------------------------------------
  describe('resilience', () => {
    it('does not block or break mutation return when success hook throws', async () => {
      callHookMock.mockImplementation(async (name: string) => {
        if (name === 'convex:mutation:success') throw new Error('hook crashed')
      })

      const callable = createConvexCallState({
        fnName: 'posts:create',
        callType: 'mutation',
        logger: noopLogger(),
        nuxtApp: nuxtApp as any,
        hasOptimisticUpdate: false,
        callFn: async () => ({ id: '1' }),
      })

      // The mutation should still resolve successfully
      const result = await callable({} as never)
      expect(result).toEqual({ id: '1' })
    })

    it('does not swallow the original error when error hook throws', async () => {
      callHookMock.mockImplementation(async (name: string) => {
        if (name === 'convex:mutation:error') throw new Error('hook crashed')
      })

      const callable = createConvexCallState({
        fnName: 'posts:create',
        callType: 'mutation',
        logger: noopLogger(),
        nuxtApp: nuxtApp as any,
        hasOptimisticUpdate: false,
        callFn: async () => {
          throw new Error('original error')
        },
      })

      // The original error should still propagate
      await expect(callable({} as never)).rejects.toThrow('original error')
    })
  })
})
