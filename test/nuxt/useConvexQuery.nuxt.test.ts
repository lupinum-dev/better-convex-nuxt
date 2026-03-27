import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

import { useState } from '#imports'

import {
  createConvexQueryState,
  useConvexQuery,
  type UseConvexQueryOptions,
} from '../../src/runtime/composables/useConvexQuery'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

function useConvexQueryState<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
) {
  return createConvexQueryState<Query, Args, DataT>(query, args, options, true).resultData
}

describe('useConvexQuery composables (Nuxt runtime)', () => {
  it('useConvexQuery blocks until first value arrives with blocking: true', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:blocking-default')

    const { result } = await captureInNuxt(() => useConvexQuery(query, {}, { blocking: true }), { convex })

    let settled = false
    const blockingResult = result.then((value) => {
      settled = true
      return value
    })

    await waitFor(() => convex.calls.onUpdate.length > 0)
    await Promise.resolve()
    expect(settled).toBe(false)

    convex.emitQueryResult(query, {}, [{ _id: 'n1', title: 'Loaded' }])
    const resolved = await blockingResult

    expect(resolved.status.value).toBe('success')
    expect(resolved.pending.value).toBe(false)
    expect(resolved.data.value).toEqual([{ _id: 'n1', title: 'Loaded' }])
  })

  it('returns skipped + pending=false immediately for null args', async () => {
    const query = mockFnRef<'query'>('notes:list:disabled-static')
    const { result } = await captureInNuxt(
      () => useConvexQueryState(query, null, {}),
      {
        convex: new MockConvexClient(),
      },
    )

    expect(result.data.value).toBeNull()
    expect(result.pending.value).toBe(false)
    expect(result.status.value).toBe('skipped')
  })

  it('exposes refresh/clear but omits execute on query return shape', async () => {
    const query = mockFnRef<'query'>('notes:list:return-shape')
    const { result } = await captureInNuxt(
      () => useConvexQueryState(query, null, {}),
      {
        convex: new MockConvexClient(),
      },
    )

    expect(typeof result.refresh).toBe('function')
    expect(typeof result.clear).toBe('function')
    expect('execute' in (result as unknown as Record<string, unknown>)).toBe(false)
  })

  it('omits Authorization header when no token is cached (auth:auto with no token)', async () => {
    const query = mockFnRef<'query'>('notes:list:auth-none')
    const fetchMock = vi.fn(async () => ({ value: [{ _id: 'n1' }] }))
    vi.stubGlobal('$fetch', fetchMock)

    await captureInNuxt(() => useConvexQueryState(query, {}, { subscribe: false }), {
      convex: new MockConvexClient(),
    })

    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('uses cached token in auth:auto client HTTP mode', async () => {
    const query = mockFnRef<'query'>('notes:list:auth-auto')
    const fetchMock = vi.fn(async () => ({ value: [{ _id: 'n1' }] }))
    vi.stubGlobal('$fetch', fetchMock)

    await captureInNuxt(
      () => {
        const token = useState<string | null>('convex:token')
        token.value = 'cached.jwt.token'
        return useConvexQueryState(query, {}, { subscribe: false })
      },
      { convex: new MockConvexClient() },
    )

    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cached.jwt.token')
  })

  it('null args does not start subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:enabled-false')

    const { result } = await captureInNuxt(
      () => useConvexQueryState(query, null, {}),
      { convex },
    )

    expect(result.status.value).toBe('skipped')
    expect(result.pending.value).toBe(false)
    expect(convex.calls.onUpdate.length).toBe(0)
  })

  it('uses default value while loading and transitions to success on first update', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:default-loading')

    const { result } = await captureInNuxt(
      () =>
        useConvexQueryState(
          query,
          {},
          {
            default: () => [{ _id: 'default', title: 'Loading placeholder' }],
          },
        ),
      { convex },
    )

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

    const { result, wrapper } = await captureInNuxt(
      () => {
        const parent = useConvexQueryState(
          query,
          {},
          {
            transform: (input) => input.count,
          },
        )
        const child = useConvexQueryState(
          query,
          {},
          {
            transform: (input) => `count:${input.count}`,
          },
        )
        return { parent, child }
      },
      { convex },
    )

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

    const { result, flush } = await captureInNuxt(
      () => {
        const lateEnabled = ref(false)
        const primary = useConvexQueryState(query, {})
        const late = useConvexQueryState(query, {}, { enabled: () => lateEnabled.value })
        return { lateEnabled, primary, late }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryError(query, {}, new Error('upstream unavailable'))
    await waitFor(() => result.primary.error.value?.message === 'upstream unavailable')

    result.lateEnabled.value = true
    await flush()

    await waitFor(() => result.late.error.value?.message === 'upstream unavailable')

    convex.emitQueryResult(query, {}, { count: 7 })
    await waitFor(
      () => result.primary.data.value?.count === 7 && result.late.data.value?.count === 7,
    )

    expect(result.primary.error.value).toBeFalsy()
    expect(result.late.error.value).toBeFalsy()
  })

  it('re-subscribes when nested reactive args mutate deeply', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:deep-args')

    const { result, flush } = await captureInNuxt(
      () => {
        const args = ref({ filter: { tag: 'alpha' } })
        const queryResult = useConvexQueryState(query, args)
        return { args, queryResult }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResult(query, { filter: { tag: 'alpha' } }, { tag: 'alpha', hits: 2 })
    await waitFor(() => result.queryResult.data.value?.tag === 'alpha')

    result.args.value.filter.tag = 'beta'
    await flush()

    await waitFor(() =>
      convex.calls.onUpdate.some((call) => {
        const args = call.args as { filter?: { tag?: string } }
        return args.filter?.tag === 'beta'
      }),
    )

    convex.emitQueryResult(query, { filter: { tag: 'beta' } }, { tag: 'beta', hits: 5 })
    await waitFor(() => result.queryResult.data.value?.tag === 'beta')
  })

  it('re-subscribes when args are passed as a getter function', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:getter-args')

    const { result, flush } = await captureInNuxt(
      () => {
        const tag = ref('alpha')
        const queryResult = useConvexQueryState(query, () => ({
          filter: { tag: tag.value },
        }))
        return { tag, queryResult }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResult(query, { filter: { tag: 'alpha' } }, { tag: 'alpha', hits: 2 })
    await waitFor(() => result.queryResult.data.value?.tag === 'alpha')

    result.tag.value = 'beta'
    await flush()

    await waitFor(() =>
      convex.calls.onUpdate.some((call) => {
        const args = call.args as { filter?: { tag?: string } }
        return args.filter?.tag === 'beta'
      }),
    )

    convex.emitQueryResult(query, { filter: { tag: 'beta' } }, { tag: 'beta', hits: 4 })
    await waitFor(() => result.queryResult.data.value?.tag === 'beta')
  })

  it('deep-unrefs refs inside plain args objects', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:deep-unref')

    const { result, flush } = await captureInNuxt(
      () => {
        const tag = ref('alpha')
        const queryResult = useConvexQueryState(
          query,
          {
            filter: {
              tag,
            },
          },
          { deepUnrefArgs: true },
        )
        return { tag, queryResult }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResult(query, { filter: { tag: 'alpha' } }, { tag: 'alpha', hits: 1 })
    await waitFor(() => result.queryResult.data.value?.tag === 'alpha')

    result.tag.value = 'beta'
    await flush()

    await waitFor(() =>
      convex.calls.onUpdate.some((call) => {
        const args = call.args as { filter?: { tag?: string } }
        return args.filter?.tag === 'beta'
      }),
    )
  })

  it('reactive args trigger refetches for deep updates and added keys', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:reactive-args')

    const { result, flush } = await captureInNuxt(
      () => {
        const args = reactive({ filter: { tag: 'alpha' as string, sort: 'asc' as string } })
        const queryResult = useConvexQueryState(query, args)
        return { args, queryResult }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResult(
      query,
      { filter: { tag: 'alpha', sort: 'asc' } },
      { tag: 'alpha', hits: 1 },
    )
    await waitFor(() => result.queryResult.data.value?.tag === 'alpha')

    result.args.filter.tag = 'beta'
    await flush()

    await waitFor(() =>
      convex.calls.onUpdate.some((call) => {
        const args = call.args as { filter?: { tag?: string } }
        return args.filter?.tag === 'beta'
      }),
    )

    result.args.filter.sort = 'desc'
    await flush()
    await waitFor(() =>
      convex.calls.onUpdate.some((call) => {
        const args = call.args as { filter?: { sort?: string } }
        return args.filter?.sort === 'desc'
      }),
    )
  })

  it('applies transform to default values while loading', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:default-transform')

    const { result } = await captureInNuxt(
      () =>
        useConvexQueryState(
          query,
          {},
          {
            default: () => [{ _id: 'default', title: 'loading' }],
            transform: (items: Array<{ _id: string; title: string }>) =>
              items.map((item) => ({ ...item, title: item.title.toUpperCase() })),
          },
        ),
      { convex },
    )

    expect(result.data.value).toEqual([{ _id: 'default', title: 'LOADING' }])
    expect(result.pending.value).toBe(true)
  })

  it('keepPreviousData keeps settled result during args transition', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('search:notes:keep-previous')

    const { result, flush } = await captureInNuxt(
      () => {
        const tag = ref('alpha')
        const queryResult = useConvexQueryState(query, () => ({ filter: { tag: tag.value } }), {
          keepPreviousData: true,
        })
        return { tag, queryResult }
      },
      { convex },
    )

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

  it('uses pending status contract for server:false until first data', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:server-false-blocking')

    const { result } = await captureInNuxt(
      () => useConvexQueryState(query, {}, { server: false }),
      { convex },
    )

    expect(result.pending.value).toBe(true)
    expect(result.status.value).toBe('pending')

    convex.emitQueryResult(query, {}, [{ _id: 'n1' }])
    await waitFor(() => result.pending.value === false)

    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual([{ _id: 'n1' }])
  })

  // ==========================================================================
  // v0.4.0: sync-by-default, enabled, onData/onError, args-vs-options, lazy
  // ==========================================================================

  it('sync-by-default: returns data synchronously (not a Promise)', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:sync-default')

    const { result } = await captureInNuxt(
      () => {
        const queryResult = useConvexQuery(query, {})
        return { queryResult, isThenable: typeof (queryResult as unknown as { then?: unknown }).then === 'function' }
      },
      { convex },
    )

    expect(result.isThenable).toBe(false)
    expect(result.queryResult.status.value).toBe('pending')
    expect(result.queryResult.data.value).toBeNull()

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('notes:list:sync-default', [{ _id: 'n1', title: 'Hello' }])
    await waitFor(() => result.queryResult.status.value === 'success')

    expect(result.queryResult.data.value).toEqual([{ _id: 'n1', title: 'Hello' }])
  })

  it('enabled: ref(false) skips the query and re-enables on flip', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:enabled-ref')

    const { result, flush } = await captureInNuxt(
      () => {
        const enabled = ref(false)
        const queryResult = useConvexQueryState(query, {}, { enabled })
        return { enabled, queryResult }
      },
      { convex },
    )

    expect(result.queryResult.status.value).toBe('skipped')
    expect(result.queryResult.pending.value).toBe(false)
    expect(convex.activeListenerCount()).toBe(0)

    result.enabled.value = true
    await flush()

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('notes:list:enabled-ref', [{ _id: 'n1' }])
    await waitFor(() => result.queryResult.status.value === 'success')
    expect(result.queryResult.data.value).toEqual([{ _id: 'n1' }])
  })

  it('enabled: getter function skips the query', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:enabled-getter')

    const { result } = await captureInNuxt(
      () => useConvexQueryState(query, {}, { enabled: () => false }),
      { convex },
    )

    expect(result.status.value).toBe('skipped')
    expect(result.pending.value).toBe(false)
    expect(convex.activeListenerCount()).toBe(0)
  })

  it('onData callback fires on each update with transformed data', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:on-data')
    const onData = vi.fn()

    await captureInNuxt(
      () =>
        useConvexQueryState(query, {}, {
          transform: (items: Array<{ _id: string }>) => items.map((i) => i._id),
          onData,
        }),
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('notes:list:on-data', [{ _id: 'n1' }])
    await waitFor(() => onData.mock.calls.length >= 1)
    expect(onData).toHaveBeenCalledWith(['n1'])

    convex.emitQueryResultByPath('notes:list:on-data', [{ _id: 'n1' }, { _id: 'n2' }])
    await waitFor(() => onData.mock.calls.length >= 2)
    expect(onData).toHaveBeenCalledWith(['n1', 'n2'])
  })

  it('onError callback fires on query error', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:on-error')
    const onError = vi.fn()

    await captureInNuxt(
      () => useConvexQueryState(query, {}, { onError }),
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)

    const err = new Error('upstream down')
    convex.emitQueryError(query, {}, err)
    await waitFor(() => onError.mock.calls.length >= 1)
    expect(onError.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('upstream down')
  })

  it('args-vs-options heuristic: options as 2nd param for no-arg query', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:heuristic-options')

    const { result } = await captureInNuxt(
      () => useConvexQuery(query, { blocking: true }),
      { convex },
    )

    let settled = false
    const blockingResult = result.then((value) => {
      settled = true
      return value
    })

    await waitFor(() => convex.calls.onUpdate.length > 0)
    expect(settled).toBe(false)

    convex.emitQueryResultByPath('notes:list:heuristic-options', [{ _id: 'n1' }])
    const resolved = await blockingResult
    expect(resolved.status.value).toBe('success')
  })

  it('args-vs-options heuristic: plain args not mistaken for options', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:heuristic-args')

    const { result } = await captureInNuxt(
      () => {
        const queryResult = useConvexQuery(query, { title: 'hello' })
        return { queryResult, isThenable: typeof (queryResult as unknown as { then?: unknown }).then === 'function' }
      },
      { convex },
    )

    // { title: 'hello' } has no option keys → treated as args, sync return
    expect(result.isThenable).toBe(false)
    expect(result.queryResult.status.value).toBe('pending')

    await waitFor(() => convex.calls.onUpdate.length > 0)
    // Verify args were passed through
    const subscribedArgs = convex.calls.onUpdate[0]?.args
    expect(subscribedArgs).toEqual({ title: 'hello' })
  })

  it('lazy: false deprecated behaves like blocking: true', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:lazy-deprecated')

    const { result } = await captureInNuxt(
      () => useConvexQuery(query, {}, { lazy: false }),
      { convex },
    )

    // lazy: false should return a Promise (same as blocking: true)
    let settled = false
    const blockingResult = result.then((value) => {
      settled = true
      return value
    })

    await waitFor(() => convex.calls.onUpdate.length > 0)
    expect(settled).toBe(false)

    convex.emitQueryResultByPath('notes:list:lazy-deprecated', [{ _id: 'n1' }])
    const resolved = await blockingResult
    expect(resolved.status.value).toBe('success')
  })

  it('keeps shared subscription alive until the final consumer scope stops', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('counter:get:refcount')

    const first = await captureInNuxt(() => useConvexQueryState(query, {}), { convex })
    const second = await captureInNuxt(() => useConvexQueryState(query, {}), { convex })

    await waitFor(() => convex.calls.onUpdate.length >= 2)
    convex.emitQueryResult(query, {}, { count: 1 })
    await waitFor(
      () => first.result.data.value?.count === 1 && second.result.data.value?.count === 1,
    )

    first.wrapper.unmount()
    await second.flush()

    convex.emitQueryResult(query, {}, { count: 2 })
    await waitFor(() => second.result.data.value?.count === 2)

    second.wrapper.unmount()
    await waitFor(() => convex.activeListenerCount() === 0)
  })
})
