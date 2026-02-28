import { describe, expect, it } from 'vitest'

import { useConvexOnce } from '../../src/runtime/composables/useConvexOnce'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'

describe('useConvexOnce (Nuxt runtime)', () => {
  it('executes query/mutation/action one-shot calls', async () => {
    const convex = new MockConvexClient()

    const query = mockFnRef<'query'>('testing:once-query')
    const mutation = mockFnRef<'mutation'>('testing:once-mutation')
    const action = mockFnRef<'action'>('testing:once-action')

    convex.setQueryHandler('testing:once-query', async (args) => ({ ok: true, args }))
    convex.setMutationHandler('testing:once-mutation', async (args) => ({ saved: true, args }))
    convex.setActionHandler('testing:once-action', async (args) => ({ done: true, args }))

    const { result } = await captureInNuxt(() => ({
      once: useConvexOnce({ timeoutMs: 100 }),
      query,
      mutation,
      action,
    }), { convex })

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

    const { result } = await captureInNuxt(
      () => useConvexOnce({ timeoutMs: 5 }),
      { convex },
    )

    await expect(result.query(slowQuery, {} as never)).rejects.toThrow('timed out')

    const safeResult = await result.querySafe(slowQuery, {} as never)
    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe timeout result to fail')
    }
    expect(safeResult.error.message).toContain('timed out')
  })

  it('returns normalized errors from safe calls when client is unavailable', async () => {
    const query = mockFnRef<'query'>('testing:once-no-client')

    const { result } = await captureInNuxt(() => useConvexOnce({ timeoutMs: 20 }))
    const safeResult = await result.querySafe(query, {} as never)

    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe no-client result to fail')
    }
    expect(safeResult.error.message).toMatch(/Convex client not available|query is not a function/i)
  })
})
