import { describe, expect, it, vi } from 'vitest'

import * as useConvexModule from '../../src/runtime/composables/useConvex'
import { useConvexCall } from '../../src/runtime/composables/useConvexCall'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

describe('useConvexCall (Nuxt runtime)', () => {
  it('works outside component scope via runWithContext (middleware-style)', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('testing:rpc-outside-scope')
    convex.setQueryHandler('testing:rpc-outside-scope', async (args) => ({ ok: true, args }))

    const { nuxtApp } = await captureInNuxt(() => true, { convex })
    const once = await nuxtApp.runWithContext(async () => useConvexCall({ timeoutMs: 100 }))

    await expect(once.query(query, { q: 'ok' } as never)).resolves.toEqual({
      ok: true,
      args: { q: 'ok' },
    })
  })

  it('executes query/mutation/action one-shot calls', async () => {
    const convex = new MockConvexClient()

    const query = mockFnRef<'query'>('testing:once-query')
    const mutation = mockFnRef<'mutation'>('testing:once-mutation')
    const action = mockFnRef<'action'>('testing:once-action')

    convex.setQueryHandler('testing:once-query', async (args) => ({ ok: true, args }))
    convex.setMutationHandler('testing:once-mutation', async (args) => ({ saved: true, args }))
    convex.setActionHandler('testing:once-action', async (args) => ({ done: true, args }))

    const { result } = await captureInNuxt(
      () => ({
        once: useConvexCall({ timeoutMs: 100 }),
        query,
        mutation,
        action,
      }),
      { convex },
    )

    await expect(result.once.query(result.query, { q: 'abc' } as never)).resolves.toEqual({
      ok: true,
      args: { q: 'abc' },
    })
    await expect(result.once.mutation(result.mutation, { title: 'A' } as never)).resolves.toEqual({
      saved: true,
      args: { title: 'A' },
    })
    await expect(result.once.action(result.action, { id: '1' } as never)).resolves.toEqual({
      done: true,
      args: { id: '1' },
    })
  })

  it('supports timeout and safe variants that never throw', async () => {
    const convex = new MockConvexClient()
    const slowQuery = mockFnRef<'query'>('testing:once-timeout')

    convex.setQueryHandler('testing:once-timeout', async () => {
      return await new Promise(() => {
        // intentionally unresolved
      })
    })

    const { result } = await captureInNuxt(() => useConvexCall({ timeoutMs: 5 }), { convex })

    await expect(result.query(slowQuery, {} as never)).rejects.toThrow('timed out')

    const safeResult = await result.querySafe(slowQuery, {} as never)
    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe timeout result to fail')
    }
    expect(safeResult.error.message).toContain('timed out')
  })

  it('mutationSafe and actionSafe never throw and return normalized errors', async () => {
    const convex = new MockConvexClient()
    const badMutation = mockFnRef<'mutation'>('testing:once-bad-mutation')
    const badAction = mockFnRef<'action'>('testing:once-bad-action')

    convex.setMutationHandler('testing:once-bad-mutation', async () => {
      throw new Error('LIMIT_MUTATION_ONCE: Mutation once limit reached')
    })
    convex.setActionHandler('testing:once-bad-action', async () => {
      throw new Error('LIMIT_ACTION_ONCE: Action once limit reached')
    })

    const { result } = await captureInNuxt(() => useConvexCall({ timeoutMs: 20 }), { convex })

    const mutationSafeResult = await result.mutationSafe(badMutation, {} as never)
    const actionSafeResult = await result.actionSafe(badAction, {} as never)

    expect(mutationSafeResult.ok).toBe(false)
    if (mutationSafeResult.ok) {
      throw new Error('Expected mutationSafe to fail')
    }
    expect(mutationSafeResult.error.code).toBe('LIMIT_MUTATION_ONCE')

    expect(actionSafeResult.ok).toBe(false)
    if (actionSafeResult.ok) {
      throw new Error('Expected actionSafe to fail')
    }
    expect(actionSafeResult.error.code).toBe('LIMIT_ACTION_ONCE')
  })

  it('treats timeoutMs <= 0 as no timeout', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('testing:rpc-no-timeout')
    convex.setQueryHandler('testing:rpc-no-timeout', async () => ({ ok: true }))

    const { result } = await captureInNuxt(() => useConvexCall({ timeoutMs: 0 }), { convex })

    await expect(result.query(query, {} as never)).resolves.toEqual({ ok: true })
  })

  it('throws immediately when client is unavailable', async () => {
    const spy = vi.spyOn(useConvexModule, 'useConvex').mockImplementation(() => {
      throw new Error('Convex client is unavailable.')
    })
    try {
      await expect(captureInNuxt(() => useConvexCall({ timeoutMs: 20 }))).rejects.toThrow(
        /Convex client is unavailable/i,
      )
    } finally {
      spy.mockRestore()
    }
  })
})
