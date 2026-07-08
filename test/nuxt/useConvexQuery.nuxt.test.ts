import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

import { useState } from '#imports'

import {
  createConvexQueryState,
  useConvexQuery,
  type ConvexQueryArgs,
  type UseConvexQueryOptions,
} from '../../src/runtime/composables/useConvexQuery'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

function useConvexQueryState<
  Query extends FunctionReference<'query'>,
  Args extends ConvexQueryArgs<FunctionArgs<Query>> = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
) {
  return createConvexQueryState<Query, Args, DataT>(query, args, { auth: 'none', ...options }, true)
    .resultData
}

describe('useConvexQuery composables (Nuxt runtime)', () => {
  it('useConvexQuery blocks until first value arrives', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:blocking-default')

    const { result } = await captureInNuxt(() => useConvexQuery(query, {}, { auth: 'none' }), {
      convex,
    })

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

  it('returns idle + pending=false immediately for skipped args', async () => {
    const query = mockFnRef<'query'>('notes:list:disabled-static')
    const { result } = await captureInNuxt(() => useConvexQueryState(query, 'skip'), {
      convex: new MockConvexClient(),
    })

    expect(result.data.value).toBeNull()
    expect(result.pending.value).toBe(false)
    expect(result.status.value).toBe('idle')
  })

  it('treats "skip" args as idle and does not start subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:skip-static')

    const { result } = await captureInNuxt(() => useConvexQueryState(query, 'skip'), {
      convex,
    })

    expect(result.data.value).toBeNull()
    expect(result.pending.value).toBe(false)
    expect(result.isStale.value).toBe(false)
    expect(result.status.value).toBe('idle')
    expect(convex.calls.onUpdate.length).toBe(0)
  })

  it('exposes refresh/clear but omits execute on query return shape', async () => {
    const query = mockFnRef<'query'>('notes:list:return-shape')
    const { result } = await captureInNuxt(() => useConvexQueryState(query, null), {
      convex: new MockConvexClient(),
    })

    expect(typeof result.refresh).toBe('function')
    expect(typeof result.clear).toBe('function')
    expect('execute' in (result as unknown as Record<string, unknown>)).toBe(false)
  })

  it('respects global auth:none by omitting Authorization header in client HTTP mode', async () => {
    const query = mockFnRef<'query'>('notes:list:auth-none')
    const fetchMock = vi.fn(async () => ({ value: [{ _id: 'n1' }] }))
    vi.stubGlobal('$fetch', fetchMock)

    await captureInNuxt(() => useConvexQueryState(query, {}, { subscribe: false }), {
      convex: new MockConvexClient(),
      convexConfig: { defaults: { auth: 'none' } },
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
        // Signed-in settled state: a real client with a token has auth settled
        // (pending=false). The unified convex:pending default is import.meta.client
        // (pending on the client until the engine settles), so model settled here.
        const authPending = useState<boolean>('convex:pending')
        authPending.value = false
        return useConvexQueryState(query, {}, { auth: 'auto', subscribe: false })
      },
      { convex: new MockConvexClient(), convexConfig: { defaults: { auth: 'auto' } } },
    )

    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cached.jwt.token')
  })

  it('does not fetch client HTTP queries while private auth is pending', async () => {
    const query = mockFnRef<'query'>('notes:list:auth-pending-http')
    const fetchMock = vi.fn(async () => ({ value: [{ _id: 'n1' }] }))
    vi.stubGlobal('$fetch', fetchMock)

    const { result, flush } = await captureInNuxt(
      () => {
        const authPending = useState<boolean>('convex:pending')
        authPending.value = true
        const queryResult = useConvexQueryState(query, {}, { auth: 'auto', subscribe: false })
        return { authPending, queryResult }
      },
      {
        convex: new MockConvexClient(),
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    expect(result.queryResult.pending.value).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()

    result.authPending.value = false
    await flush()
  })

  it('allows per-query auth:none to fetch while auth is pending', async () => {
    const query = mockFnRef<'query'>('notes:list:per-query-auth-none')
    const fetchMock = vi.fn(async () => ({ value: [{ _id: 'n1' }] }))
    vi.stubGlobal('$fetch', fetchMock)

    const { result, flush } = await captureInNuxt(
      () => {
        const authPending = useState<boolean>('convex:pending')
        authPending.value = true
        const queryResult = useConvexQueryState(query, {}, { auth: 'none', subscribe: false })
        return { authPending, queryResult }
      },
      {
        convex: new MockConvexClient(),
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()

    result.authPending.value = false
    await flush()
  })

  it('respects skip args and does not start subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:skip-static')

    const { result } = await captureInNuxt(() => useConvexQueryState(query, 'skip'), { convex })

    expect(result.status.value).toBe('idle')
    expect(result.pending.value).toBe(false)
    expect(convex.calls.onUpdate.length).toBe(0)
  })

  it('releases an active subscription when args switch to "skip"', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:skip-reactive')

    const { result, flush } = await captureInNuxt(
      () => {
        const args = ref<ConvexQueryArgs<Record<string, never>>>({})
        const queryResult = useConvexQueryState(query, args)
        return { args, queryResult }
      },
      { convex },
    )

    await waitFor(() => convex.activeListenerCount(query, {}) >= 1)
    convex.emitQueryResult(query, {}, { ready: true })
    await waitFor(() => result.queryResult.data.value?.ready === true)
    await waitFor(() => convex.activeListenerCount(query, {}) === 1)

    result.args.value = 'skip'
    await flush()

    await waitFor(() => convex.activeListenerCount(query, {}) === 0)
    expect(result.queryResult.status.value).toBe('idle')
    expect(result.queryResult.pending.value).toBe(false)
    expect(result.queryResult.isStale.value).toBe(false)
  })

  it('waits for auth bootstrap before starting live subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:auth-gated-live')

    const { result, flush } = await captureInNuxt(
      () => {
        const authPending = useState<boolean>('convex:pending')
        const token = useState<string | null>('convex:token')
        authPending.value = true
        const queryResult = useConvexQueryState(query, {}, { auth: 'auto' })
        return { authPending, queryResult, token }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    expect(result.queryResult.pending.value).toBe(true)
    expect(convex.calls.onUpdate.length).toBe(0)

    result.token.value = 'ready.jwt.token'
    result.authPending.value = false
    await flush()

    await waitFor(() => convex.calls.onUpdate.length > 0)
  })

  it('does not wait for auth bootstrap when global query auth is none', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:auth-none-live')

    await captureInNuxt(
      () => {
        const authPending = useState<boolean>('convex:pending')
        authPending.value = true
        return useConvexQueryState(query, {})
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'none' } },
      },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
  })

  it('uses initialData while loading and transitions to success on first update', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:initial-data-loading')

    const { result } = await captureInNuxt(
      () =>
        useConvexQueryState(
          query,
          {},
          {
            initialData: [{ _id: 'initial', title: 'Loading placeholder' }],
          },
        ),
      { convex },
    )

    expect(result.data.value).toEqual([{ _id: 'initial', title: 'Loading placeholder' }])
    expect(result.pending.value).toBe(true)

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('notes:list:initial-data-loading', [
      { _id: 'n1', title: 'Loaded' },
    ])
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

    await waitFor(() => convex.activeListenerCount(query, {}) === 1)

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

  it('keeps same-source transforms with different captured values isolated', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('counter:get:captured-transform')
    const makeTransform = (prefix: string) => (input: { count: number }) =>
      `${prefix}:${input.count}`

    const { result } = await captureInNuxt(
      () => {
        const alpha = useConvexQueryState(query, {}, { transform: makeTransform('alpha') })
        const beta = useConvexQueryState(query, {}, { transform: makeTransform('beta') })
        return { alpha, beta }
      },
      { convex },
    )

    await waitFor(() => convex.activeListenerCount(query, {}) === 1)
    convex.emitQueryResult(query, {}, { count: 3 })

    await waitFor(
      () => result.alpha.data.value === 'alpha:3' && result.beta.data.value === 'beta:3',
    )
    await waitFor(() => convex.activeListenerCount(query, {}) === 1)
  })

  it('re-syncs a subscriber-specific transform after a disabled->active args transition (F-34)', async () => {
    // Pins the setupSubscription() `setTimeout(0)` re-attach: when args flip
    // from 'skip' to active and share an already-populated subscription/cache
    // with another subscriber, the newly-active subscriber must end up
    // applying its OWN transform, not leak the other subscriber's.
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('counter:get:reattach-transform')

    const { result, flush } = await captureInNuxt(
      () => {
        const lateArgs = ref<ConvexQueryArgs<Record<string, never>>>('skip')
        const primary = useConvexQueryState(query, {}, { transform: (input) => input.count })
        const late = useConvexQueryState(query, lateArgs, {
          transform: (input) => `count:${input.count}`,
        })
        return { lateArgs, primary, late }
      },
      { convex },
    )

    await waitFor(() => convex.activeListenerCount(query, {}) === 1)
    convex.emitQueryResult(query, {}, { count: 5 })
    await waitFor(() => result.primary.data.value === 5)

    result.lateArgs.value = {}
    await flush()
    // Let the setTimeout(0) macrotask (the re-attach) run.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    await waitFor(() => result.late.data.value === 'count:5')
    expect(result.primary.data.value).toBe(5)
  })

  it('handles error-before-data for late subscribers and recovers on next data', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('counter:get:error-late')

    const { result, flush } = await captureInNuxt(
      () => {
        const lateArgs = ref<Record<string, never> | null>(null)
        const primary = useConvexQueryState(query, {})
        const late = useConvexQueryState(query, lateArgs)
        return { lateArgs, primary, late }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryError(query, {}, new Error('upstream unavailable'))
    await waitFor(() => result.primary.error.value?.message === 'upstream unavailable')

    result.lateArgs.value = {}
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
        const queryResult = useConvexQueryState(query, {
          filter: {
            tag,
          },
        })
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

  it('applies transform to initialData while loading', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:initial-data-transform')

    const { result } = await captureInNuxt(
      () =>
        useConvexQueryState(
          query,
          {},
          {
            initialData: [{ _id: 'initial', title: 'loading' }],
            transform: (items: Array<{ _id: string; title: string }>) =>
              items.map((item) => ({ ...item, title: item.title.toUpperCase() })),
          },
        ),
      { convex },
    )

    expect(result.data.value).toEqual([{ _id: 'initial', title: 'LOADING' }])
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
    expect(result.queryResult.isStale.value).toBe(true)

    convex.emitQueryResult(query, { filter: { tag: 'beta' } }, { tag: 'beta', hits: 5 })
    await waitFor(() => result.queryResult.data.value?.tag === 'beta')
    expect(result.queryResult.isStale.value).toBe(false)
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

  it('keeps shared subscription alive until the final consumer scope stops', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('counter:get:refcount')

    const first = await captureInNuxt(() => useConvexQueryState(query, {}), { convex })
    const second = await captureInNuxt(() => useConvexQueryState(query, {}), { convex })

    await waitFor(() => convex.activeListenerCount(query, {}) === 1)
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
