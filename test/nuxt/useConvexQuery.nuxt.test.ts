import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'

import { useConvexQueryLazy } from '../../src/runtime/composables/useConvexQuery'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { waitFor } from '../helpers/wait-for'

describe('useConvexQueryLazy (Nuxt runtime)', () => {
  it('returns idle + pending=false immediately for disabled nullable args', async () => {
    const query = mockFnRef<'query'>('notes:list:disabled-static')
    const { result } = await captureInNuxt(
      () => useConvexQueryLazy(query, null),
      { convex: new MockConvexClient() },
    )

    expect(result.data.value).toBeNull()
    expect(result.pending.value).toBe(false)
    expect(result.status.value).toBe('idle')
  })

  it('respects enabled:false and does not start subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:enabled-false')

    const { result } = await captureInNuxt(
      () => useConvexQueryLazy(query, {}, { enabled: false }),
      { convex },
    )

    expect(result.status.value).toBe('idle')
    expect(result.pending.value).toBe(false)
    expect(convex.calls.onUpdate.length).toBe(0)
  })

  it('uses default value while loading and transitions to success on first update', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:default-loading')

    const { result } = await captureInNuxt(() =>
      useConvexQueryLazy(query, {}, {
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

    const { result, wrapper } = await captureInNuxt(() => {
      const parent = useConvexQueryLazy(query, {}, {
        transform: input => input.count,
      })
      const child = useConvexQueryLazy(query, {}, {
        transform: input => `count:${input.count}`,
      })
      return { parent, child }
    }, { convex })

    await waitFor(() => convex.calls.onUpdate.length >= 2)

    convex.emitQueryResult(query, {}, { count: 0 })
    await waitFor(() => result.parent.data.value === 0 && result.child.data.value === 'count:0')
    await waitFor(() => convex.activeListenerCount(query, {}) === 1)

    expect(result.parent.status.value).toBe('success')
    expect(result.child.status.value).toBe('success')

    convex.emitQueryResult(query, {}, { count: 1 })
    await waitFor(() => result.parent.data.value === 1 && result.child.data.value === 'count:1')

    wrapper.unmount()
    await waitFor(() => convex.activeListenerCount() === 0)
  })

  it('handles error-before-data for late subscribers and recovers on next data', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('counter:get:error-late')

    const { result, flush } = await captureInNuxt(() => {
      const lateArgs = ref<Record<string, never> | null>(null)
      const primary = useConvexQueryLazy(query, {})
      const late = useConvexQueryLazy(query, lateArgs)
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

    expect(result.primary.error.value).toBeFalsy()
    expect(result.late.error.value).toBeFalsy()
  })

  it('re-subscribes when nested reactive args mutate deeply', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:deep-args')

    const { result, flush } = await captureInNuxt(() => {
      const args = ref({ filter: { tag: 'alpha' } })
      const queryResult = useConvexQueryLazy(query, args)
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

  it('re-subscribes when args are passed as a getter function', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:getter-args')

    const { result, flush } = await captureInNuxt(() => {
      const tag = ref('alpha')
      const queryResult = useConvexQueryLazy(query, () => ({
        filter: { tag: tag.value },
      }))
      return { tag, queryResult }
    }, { convex })

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResult(query, { filter: { tag: 'alpha' } }, { tag: 'alpha', hits: 2 })
    await waitFor(() => result.queryResult.data.value?.tag === 'alpha')

    result.tag.value = 'beta'
    await flush()

    await waitFor(() => convex.calls.onUpdate.some((call) => {
      const args = call.args as { filter?: { tag?: string } }
      return args.filter?.tag === 'beta'
    }))

    convex.emitQueryResult(query, { filter: { tag: 'beta' } }, { tag: 'beta', hits: 4 })
    await waitFor(() => result.queryResult.data.value?.tag === 'beta')
  })

  it('deep-unrefs refs inside plain args objects', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:deep-unref')

    const { result, flush } = await captureInNuxt(() => {
      const tag = ref('alpha')
      const queryResult = useConvexQueryLazy(query, {
        filter: {
          tag,
        },
      })
      return { tag, queryResult }
    }, { convex })

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResult(query, { filter: { tag: 'alpha' } }, { tag: 'alpha', hits: 1 })
    await waitFor(() => result.queryResult.data.value?.tag === 'alpha')

    result.tag.value = 'beta'
    await flush()

    await waitFor(() => convex.calls.onUpdate.some((call) => {
      const args = call.args as { filter?: { tag?: string } }
      return args.filter?.tag === 'beta'
    }))
  })

  it('reactive args trigger refetches for deep updates and added keys', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:reactive-args')

    const { result, flush } = await captureInNuxt(() => {
      const args = reactive({ filter: { tag: 'alpha' as string, sort: 'asc' as string } })
      const queryResult = useConvexQueryLazy(query, args)
      return { args, queryResult }
    }, { convex })

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResult(query, { filter: { tag: 'alpha', sort: 'asc' } }, { tag: 'alpha', hits: 1 })
    await waitFor(() => result.queryResult.data.value?.tag === 'alpha')

    result.args.filter.tag = 'beta'
    await flush()

    await waitFor(() => convex.calls.onUpdate.some((call) => {
      const args = call.args as { filter?: { tag?: string } }
      return args.filter?.tag === 'beta'
    }))

    result.args.filter.sort = 'desc'
    await flush()
    await waitFor(() => convex.calls.onUpdate.some((call) => {
      const args = call.args as { filter?: { sort?: string } }
      return args.filter?.sort === 'desc'
    }))
  })

  it('applies transform to default values while loading', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:default-transform')

    const { result } = await captureInNuxt(() =>
      useConvexQueryLazy(query, {}, {
        default: () => [{ _id: 'default', title: 'loading' }],
        transform: (items: Array<{ _id: string; title: string }>) =>
          items.map(item => ({ ...item, title: item.title.toUpperCase() })),
      }), { convex })

    expect(result.data.value).toEqual([{ _id: 'default', title: 'LOADING' }])
    expect(result.pending.value).toBe(true)
  })

  it('keepPreviousData keeps settled result during args transition', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:keep-previous')

    const { result, flush } = await captureInNuxt(() => {
      const tag = ref('alpha')
      const queryResult = useConvexQueryLazy(
        query,
        () => ({ filter: { tag: tag.value } }),
        { keepPreviousData: true },
      )
      return { tag, queryResult }
    }, { convex })

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResult(query, { filter: { tag: 'alpha' } }, { tag: 'alpha', hits: 2 })
    await waitFor(() => result.queryResult.data.value?.tag === 'alpha')

    result.tag.value = 'beta'
    await flush()

    expect(result.queryResult.data.value).toEqual({ tag: 'alpha', hits: 2 })
    expect(result.queryResult.pending.value).toBe(true)

    convex.emitQueryResult(query, { filter: { tag: 'beta' } }, { tag: 'beta', hits: 5 })
    await waitFor(() => result.queryResult.data.value?.tag === 'beta')
  })

  it('uses pending status contract for server:false in lazy mode until first data', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:server-false-lazy')

    const { result } = await captureInNuxt(
      () => useConvexQueryLazy(query, {}, { server: false }),
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

    const first = await captureInNuxt(() => useConvexQueryLazy(query, {}), { convex })
    const second = await captureInNuxt(() => useConvexQueryLazy(query, {}), { convex })

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
