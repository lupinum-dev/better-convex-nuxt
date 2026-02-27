import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useConvexQuery } from '../../src/runtime/composables/useConvexQuery'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { waitFor } from '../helpers/wait-for'

describe('useConvexQuery (Nuxt runtime)', () => {
  it('returns idle + pending=false immediately for static skip queries', async () => {
    const query = mockFnRef<'query'>('notes:list:skip-static')
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
    const query = mockFnRef<'query'>('notes:list:default-loading')

    const { result } = await captureInNuxt(() =>
      useConvexQuery(query, {}, {
        default: () => [{ _id: 'default', title: 'Loading placeholder' }],
      }), { convex })

    expect(result.data.value).toEqual([{ _id: 'default', title: 'Loading placeholder' }])
    expect(result.pending.value).toBe(true)

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('notes:list:default-loading', [{ _id: 'n1', title: 'Loaded' }])
    await waitFor(() => result.pending.value === false)

    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual([{ _id: 'n1', title: 'Loaded' }])
  })

  it('deduplicates subscriptions and keeps divergent transforms isolated', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('counter:get:divergent')

    const { result } = await captureInNuxt(() => {
      const parent = useConvexQuery(query, {}, {
        transform: input => input.count,
      })
      const child = useConvexQuery(query, {}, {
        transform: input => `count:${input.count}`,
      })
      return { parent, child }
    }, { convex })

    await waitFor(() => convex.calls.onUpdate.length >= 2)

    convex.emitQueryResult(query, {}, { count: 0 })
    await waitFor(() => result.parent.data.value === 0 && result.child.data.value === 'count:0')

    expect(result.parent.status.value).toBe('success')
    expect(result.child.status.value).toBe('success')

    convex.emitQueryResult(query, {}, { count: 1 })
    await waitFor(() => result.parent.data.value === 1 && result.child.data.value === 'count:1')
  })

  it('handles error-before-data for late subscribers and recovers on next data', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('counter:get:error-late')

    const { result, flush } = await captureInNuxt(() => {
      const lateArgs = ref<'skip' | Record<string, never>>('skip')
      const primary = useConvexQuery(query, {})
      const late = useConvexQuery(query, lateArgs)
      return { lateArgs, primary, late }
    }, { convex })

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryError(query, {}, new Error('upstream unavailable'))
    await waitFor(() => result.primary.error.value?.message === 'upstream unavailable')

    result.lateArgs.value = {}
    await flush()

    await waitFor(() => result.late.error.value?.message === 'upstream unavailable')

    convex.emitQueryResult(query, {}, { count: 7 })
    await waitFor(() => result.primary.data.value?.count === 7 && result.late.data.value?.count === 7)

    expect(result.primary.error.value).toBeNull()
    expect(result.late.error.value).toBeNull()
  })

  it('re-subscribes when nested reactive args mutate deeply', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:deep-args')

    const { result, flush } = await captureInNuxt(() => {
      const args = ref({ filter: { tag: 'alpha' } })
      const queryResult = useConvexQuery(query, args)
      return { args, queryResult }
    }, { convex })

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResult(query, { filter: { tag: 'alpha' } }, { tag: 'alpha', hits: 2 })
    await waitFor(() => result.queryResult.data.value?.tag === 'alpha')

    result.args.value.filter.tag = 'beta'
    await flush()

    await waitFor(() => convex.calls.onUpdate.some((call) => {
      const args = call.args as { filter?: { tag?: string } }
      return args.filter?.tag === 'beta'
    }))

    convex.emitQueryResult(query, { filter: { tag: 'beta' } }, { tag: 'beta', hits: 5 })
    await waitFor(() => result.queryResult.data.value?.tag === 'beta')
  })

  it('uses pending status contract for server:false + lazy:true until first data', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:server-false-lazy')

    const { result } = await captureInNuxt(
      () => useConvexQuery(query, {}, { server: false, lazy: true }),
      { convex },
    )

    expect(result.pending.value).toBe(true)
    expect(result.status.value).toBe('pending')

    convex.emitQueryResult(query, {}, [{ _id: 'n1' }])
    await waitFor(() => result.pending.value === false)

    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual([{ _id: 'n1' }])
  })

  it('keeps shared subscription alive until the final consumer scope stops', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('counter:get:refcount')

    const first = await captureInNuxt(() => useConvexQuery(query, {}), { convex })
    const second = await captureInNuxt(() => useConvexQuery(query, {}), { convex })

    await waitFor(() => convex.calls.onUpdate.length >= 2)
    convex.emitQueryResult(query, {}, { count: 1 })
    await waitFor(() => first.result.data.value?.count === 1 && second.result.data.value?.count === 1)

    first.wrapper.unmount()
    await second.flush()

    convex.emitQueryResult(query, {}, { count: 2 })
    await waitFor(() => second.result.data.value?.count === 2)

    second.wrapper.unmount()
    await waitFor(() => convex.activeListenerCount() === 0)
  })
})
