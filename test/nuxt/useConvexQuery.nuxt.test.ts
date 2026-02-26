import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useConvexQuery } from '../../src/runtime/composables/useConvexQuery'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { waitFor } from '../helpers/wait-for'

describe('useConvexQuery (Nuxt runtime)', () => {
  it('returns idle + pending=false immediately for static skip queries', async () => {
    const query = mockFnRef<'query'>('notes:list')
    const { result } = await captureInNuxt(
      () => useConvexQuery(query, 'skip'),
      { convex: new MockConvexClient() },
    )

    expect(result.data.value).toBeNull()
    expect(result.pending.value).toBe(false)
    expect(result.status.value).toBe('idle')
  })

  it('uses default value while loading and transitions to success on first update', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list')

    const { result } = await captureInNuxt(() =>
      useConvexQuery(query, {}, {
        default: () => [{ _id: 'default', title: 'Loading placeholder' }],
      }), { convex })

    expect(result.data.value).toEqual([{ _id: 'default', title: 'Loading placeholder' }])
    expect(result.pending.value).toBe(true)

    convex.emitQueryResultByPath('notes:list', [{ _id: 'n1', title: 'Loaded' }])
    await waitFor(() => result.pending.value === false, { timeoutMs: 1000 })

    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual([{ _id: 'n1', title: 'Loaded' }])
  })

  it('subscribes when reactive args switch from skip to concrete args', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:get')

    const { result, flush } = await captureInNuxt(() => {
      const args = ref<'skip' | { id: string }>('skip')
      const queryResult = useConvexQuery(query, args)
      return { args, queryResult }
    }, { convex })

    expect(result.queryResult.status.value).toBe('idle')
    expect(convex.activeListenerCount()).toBe(0)

    result.args.value = { id: 'n1' }
    await flush()

    await waitFor(() => convex.activeListenerCount(query, { id: 'n1' }) > 0, {
      timeoutMs: 1000,
    })

    convex.emitQueryResult(query, { id: 'n1' }, { _id: 'n1', title: 'First note' })

    await waitFor(
      () => result.queryResult.data.value?._id === 'n1',
      { timeoutMs: 1000 },
    )

    expect(result.queryResult.status.value).toBe('success')
    expect(result.queryResult.data.value).toEqual({ _id: 'n1', title: 'First note' })
  })
})
