import type { FunctionReference, PaginationOptions, PaginationResult } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

import { useState } from '#imports'

import {
  createConvexPaginatedQueryState,
  useConvexPaginatedQuery,
  type ConvexPaginatedQueryArgs,
  type PaginatedQueryArgs,
  type PaginatedQueryReference,
  type PaginatedQueryItem,
  type UseConvexPaginatedQueryOptions,
} from '../../src/runtime/composables/useConvexPaginatedQuery'
import {
  clearAuthSubscriptions,
  getQueryKey,
  getSubscriptionCache,
  withAuthDimension,
} from '../../src/runtime/utils/convex-cache'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

const { handleUnauthorizedMock } = vi.hoisted(() => ({
  handleUnauthorizedMock: vi.fn(),
}))

vi.mock('../../src/runtime/utils/auth-unauthorized', () => ({
  handleUnauthorizedAuthFailure: handleUnauthorizedMock,
}))

function useConvexPaginatedQueryState<
  Query extends PaginatedQueryReference,
  Args extends ConvexPaginatedQueryArgs<PaginatedQueryArgs<Query>> = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
) {
  return createConvexPaginatedQueryState<Query, Args, TransformedItem>(
    query,
    args,
    { auth: 'none', ...options },
    true,
  ).resultData
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  handleUnauthorizedMock.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useConvexPaginatedQuery composables (Nuxt runtime)', () => {
  it('useConvexPaginatedQuery blocks until the first page arrives', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:blocking-default')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQuery(query as never, {}, { auth: 'none', initialNumItems: 2 }),
      { convex },
    )

    let settled = false
    const blockingResult = result.then((value) => {
      settled = true
      return value
    })

    await waitFor(() => convex.calls.onUpdate.length > 0)
    await Promise.resolve()
    expect(settled).toBe(false)

    convex.emitQueryResultByPath('notes:listPaginated:blocking-default', {
      page: [{ _id: 'n1', title: 'A' }],
      isDone: true,
      continueCursor: null,
    })
    const resolved = await blockingResult

    expect(resolved.status.value).toBe('exhausted')
    expect(resolved.isLoading.value).toBe(false)
    expect(resolved.results.value).toEqual([{ _id: 'n1', title: 'A' }])
  })

  it('returns idle + not loading for skipped args', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:disabled-static')
    const { result } = await captureInNuxt(
      () => useConvexPaginatedQueryState(query as never, 'skip', { initialNumItems: 3 }),
      { convex: new MockConvexClient() },
    )

    expect(result.status.value).toBe('idle')
    expect(result.isLoading.value).toBe(false)
    expect(result.results.value).toEqual([])
  })

  it('treats "skip" args as idle and does not start subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:skip-static')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQueryState(query as never, 'skip', { initialNumItems: 3 }),
      { convex },
    )

    expect(result.status.value).toBe('idle')
    expect(result.isLoading.value).toBe(false)
    expect(result.isStale.value).toBe(false)
    expect(result.hasNextPage.value).toBe(false)
    expect(result.results.value).toEqual([])
    expect(convex.calls.onUpdate.length).toBe(0)
  })

  it('respects skip args and does not start subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:skip-static')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQueryState(query as never, 'skip', { initialNumItems: 3 }),
      { convex },
    )

    expect(result.status.value).toBe('idle')
    expect(result.isLoading.value).toBe(false)
    expect(result.hasNextPage.value).toBe(false)
    expect(convex.calls.onUpdate.length).toBe(0)
  })

  it('releases active subscriptions when args switch to "skip"', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:skip-reactive')

    const { result, flush } = await captureInNuxt(
      () => {
        const args = ref<ConvexPaginatedQueryArgs<Record<string, never>>>({})
        const queryResult = useConvexPaginatedQueryState(query as never, args, {
          initialNumItems: 2,
        })
        return { args, queryResult }
      },
      { convex },
    )

    await waitFor(() => convex.activeListenerCount() >= 1)
    convex.emitQueryResultByPath('notes:listPaginated:skip-reactive', {
      page: [{ _id: 'n1', title: 'A' }],
      isDone: false,
      continueCursor: 'c1',
    })
    await waitFor(() => result.queryResult.results.value.length === 1)
    await waitFor(() => convex.activeListenerCount() === 1)

    result.args.value = 'skip'
    await flush()

    await waitFor(() => convex.activeListenerCount() === 0)
    expect(result.queryResult.status.value).toBe('idle')
    expect(result.queryResult.isLoading.value).toBe(false)
    expect(result.queryResult.isStale.value).toBe(false)
    expect(result.queryResult.results.value).toEqual([])
  })

  it('waits for auth bootstrap before starting paginated live subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:auth-gated-live')

    const { result, flush } = await captureInNuxt(
      () => {
        const authPending = useState<boolean>('convex:pending')
        const token = useState<string | null>('convex:token')
        authPending.value = true
        const queryResult = useConvexPaginatedQueryState(
          query as never,
          {},
          {
            auth: 'auto',
            initialNumItems: 2,
          },
        )
        return { authPending, queryResult, token }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    expect(result.queryResult.status.value).toBe('loading-first-page')
    expect(convex.calls.onUpdate.length).toBe(0)

    result.token.value = 'ready.jwt.token'
    result.authPending.value = false
    await flush()

    await waitFor(() => convex.activeListenerCount() >= 1)
  })

  it('does not wait for auth bootstrap when paginated query auth is none', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:auth-none-live')

    const { result, flush } = await captureInNuxt(
      () => {
        const authPending = useState<boolean>('convex:pending')
        authPending.value = true
        const queryResult = useConvexPaginatedQueryState(
          query as never,
          {},
          {
            auth: 'none',
            initialNumItems: 2,
          },
        )
        return { authPending, queryResult }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    await waitFor(() => convex.activeListenerCount() >= 1)

    result.authPending.value = false
    await flush()
  })

  it('does not alias paginated first-page subscriptions mounted as auth:auto and auth:none', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:mixed-auth')

    const { result, nuxtApp } = await captureInNuxt(
      () => {
        useState<boolean>('convex:pending', () => false)
        useState<string | null>('convex:token', () => 'signed.in.jwt')
        const authResult = useConvexPaginatedQueryState(
          query as never,
          {},
          {
            auth: 'auto',
            initialNumItems: 2,
          },
        )
        const publicResult = useConvexPaginatedQueryState(
          query as never,
          {},
          {
            auth: 'none',
            initialNumItems: 2,
          },
        )
        return { authResult, publicResult }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    await waitFor(() => convex.activeListenerCount() === 2)

    const rawFirstPageKey = `paginated:${getQueryKey(query, {
      paginationOpts: { numItems: 2, cursor: null },
    })}`
    const authKey = withAuthDimension(rawFirstPageKey, 'auto')
    const publicKey = withAuthDimension(rawFirstPageKey, 'none')

    expect(getSubscriptionCache(nuxtApp).has(authKey)).toBe(true)
    expect(getSubscriptionCache(nuxtApp).has(publicKey)).toBe(true)

    clearAuthSubscriptions(nuxtApp)
    expect(getSubscriptionCache(nuxtApp).has(authKey)).toBe(false)
    expect(getSubscriptionCache(nuxtApp).has(publicKey)).toBe(true)

    convex.emitQueryResultByPath('notes:listPaginated:mixed-auth', {
      page: [{ _id: 'p1', title: 'public' }],
      isDone: true,
      continueCursor: null,
    })

    await waitFor(() => result.publicResult.results.value.length === 1)
    expect(result.publicResult.results.value).toEqual([{ _id: 'p1', title: 'public' }])
  })

  it('walks the full status machine: loading-first-page -> ready -> loading-more -> exhausted', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:state-machine')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2 }),
      { convex },
    )

    expect(result.status.value).toBe('loading-first-page')

    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts
          ?.cursor
        return path === 'notes:listPaginated:state-machine' && cursor === null
      },
      {
        page: [
          { _id: 'n1', title: 'A' },
          { _id: 'n2', title: 'B' },
        ],
        isDone: false,
        continueCursor: 'c1',
      },
    )

    await waitFor(() => result.status.value === 'ready')
    expect(result.isLoading.value).toBe(false)
    expect(result.hasNextPage.value).toBe(true)

    result.loadMore(2)
    await waitFor(() => result.status.value === 'loading-more')
    expect(result.isLoading.value).toBe(true)
    await waitFor(() =>
      convex.calls.onUpdate.some((call) => {
        const args = call.args as { paginationOpts?: { cursor?: string | null } }
        return args.paginationOpts?.cursor === 'c1'
      }),
    )

    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts
          ?.cursor
        return path === 'notes:listPaginated:state-machine' && cursor === 'c1'
      },
      {
        page: [{ _id: 'n3', title: 'C' }],
        isDone: true,
        continueCursor: null,
      },
    )

    await waitFor(() => result.status.value === 'exhausted')
    expect(result.hasNextPage.value).toBe(false)
    expect(result.isLoading.value).toBe(false)
    const finalResults = result.results.value as Array<{ _id: string }>
    expect(finalResults.map((item) => item._id)).toEqual(['n1', 'n2', 'n3'])
  })

  it('refresh() re-fetches all loaded pages in HTTP mode', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:refresh-http')
    const responses: Record<string, unknown> = {
      null: {
        page: [
          { _id: 'n1', title: 'A' },
          { _id: 'n2', title: 'B' },
        ],
        isDone: false,
        continueCursor: 'c1',
      },
      c1: {
        page: [{ _id: 'n3', title: 'C' }],
        isDone: true,
        continueCursor: null,
      },
    }

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      const cursor = body.args?.paginationOpts?.cursor
      return {
        value: responses[cursor === null || cursor === undefined ? 'null' : String(cursor)],
      }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.results.value.length === 2)

    result.loadMore(2)
    await waitFor(() => result.results.value.length === 3)

    responses.null = {
      page: [
        { _id: 'n1', title: 'A (refreshed)' },
        { _id: 'n2', title: 'B (refreshed)' },
      ],
      isDone: false,
      continueCursor: 'c1',
    }
    responses.c1 = {
      page: [{ _id: 'n3', title: 'C (refreshed)' }],
      isDone: true,
      continueCursor: null,
    }

    await result.refresh()

    await waitFor(() => {
      const refreshed = result.results.value as Array<{ title: string }>
      return refreshed[0]?.title === 'A (refreshed)' && refreshed[2]?.title === 'C (refreshed)'
    })
  })

  it('refresh() keeps previous pages when a later page refresh fails', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:refresh-atomic')
    const responses: Record<string, unknown> = {
      null: {
        page: [
          { _id: 'n1', title: 'A' },
          { _id: 'n2', title: 'B' },
        ],
        isDone: false,
        continueCursor: 'c1',
      },
      c1: {
        page: [{ _id: 'n3', title: 'C' }],
        isDone: true,
        continueCursor: null,
      },
    }

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      const cursor = body.args?.paginationOpts?.cursor
      const key = cursor === null || cursor === undefined ? 'null' : String(cursor)
      const response = responses[key]
      if (response instanceof Error) throw response
      return { value: response }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.results.value.length === 2)

    result.loadMore(2)
    await waitFor(() => result.results.value.length === 3)

    responses.null = {
      page: [
        { _id: 'n1', title: 'A (refreshed)' },
        { _id: 'n2', title: 'B (refreshed)' },
      ],
      isDone: false,
      continueCursor: 'c1',
    }
    responses.c1 = new Error('second page failed')

    await result.refresh()

    expect(result.error.value?.message).toBe('second page failed')
    expect((result.results.value as Array<{ title: string }>).map((item) => item.title)).toEqual([
      'A',
      'B',
      'C',
    ])
  })

  it('refresh() re-chains fresh cursors so an insert into an earlier page stays gapless (F-26b)', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:refresh-gapless')
    // Ordered list starts [n1, n2, n3, n4]; two pages of 2 items each.
    const responses: Record<string, unknown> = {
      null: {
        page: [
          { _id: 'n1', title: 'n1' },
          { _id: 'n2', title: 'n2' },
        ],
        isDone: false,
        continueCursor: 'after-n2',
      },
      'after-n2': {
        page: [
          { _id: 'n3', title: 'n3' },
          { _id: 'n4', title: 'n4' },
        ],
        isDone: true,
        continueCursor: 'after-n4',
      },
    }

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      const cursor = body.args?.paginationOpts?.cursor
      const key = cursor === null || cursor === undefined ? 'null' : String(cursor)
      return { value: responses[key] }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.results.value.length === 2)
    result.loadMore(2)
    await waitFor(() => result.results.value.length === 4)

    // Insert n1.5 into page 1's range. New list: [n1, n1.5, n2, n3, n4].
    // Page 1 (numItems 2, cursor null) now ends earlier, with a NEW continueCursor.
    responses.null = {
      page: [
        { _id: 'n1', title: 'n1' },
        { _id: 'n1.5', title: 'n1.5' },
      ],
      isDone: false,
      continueCursor: 'after-n1.5',
    }
    // The correctly-chained follow-up page starts at page 1's FRESH cursor.
    responses['after-n1.5'] = {
      page: [
        { _id: 'n2', title: 'n2' },
        { _id: 'n3', title: 'n3' },
      ],
      isDone: false,
      continueCursor: 'after-n3',
    }
    // The STALE stored cursor still resolves: a parallel refresh replaying it
    // would drop n2, leaving a gap [n1, n1.5, n3, n4].
    responses['after-n2'] = {
      page: [
        { _id: 'n3', title: 'n3' },
        { _id: 'n4', title: 'n4' },
      ],
      isDone: true,
      continueCursor: 'after-n4',
    }

    const callsBefore = fetchMock.mock.calls.length
    await result.refresh()

    // Gapless, ordered concatenation — n2 is not dropped between the pages.
    expect((result.results.value as Array<{ _id: string }>).map((item) => item._id)).toEqual([
      'n1',
      'n1.5',
      'n2',
      'n3',
    ])

    // The follow-up page was re-fetched with the fresh chained cursor, never the
    // stale stored one.
    const refreshCursors = fetchMock.mock.calls.slice(callsBefore).map((call) => {
      const init = call[1] as RequestInit | undefined
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      return body.args?.paginationOpts?.cursor ?? null
    })
    expect(refreshCursors).toContain('after-n1.5')
    expect(refreshCursors).not.toContain('after-n2')
  })

  it('loadMore() is ignored while refresh() is rebuilding the page chain', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:refresh-loadMore-race')
    const inFlightRefresh = deferred<{ value: PaginationResult<{ _id: string; title: string }> }>()
    let holdNextFirstPage = false
    const responses: Record<string, unknown> = {
      null: {
        page: [
          { _id: 'n1', title: 'A' },
          { _id: 'n2', title: 'B' },
        ],
        isDone: false,
        continueCursor: 'c1',
      },
      c1: {
        page: [{ _id: 'n3', title: 'C' }],
        isDone: false,
        continueCursor: 'c2',
      },
      c2: {
        page: [{ _id: 'n4', title: 'D' }],
        isDone: true,
        continueCursor: null,
      },
    }

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      const cursor = body.args?.paginationOpts?.cursor
      const key = cursor === null || cursor === undefined ? 'null' : String(cursor)
      if (key === 'null' && holdNextFirstPage) {
        holdNextFirstPage = false
        return inFlightRefresh.promise
      }
      return { value: responses[key] }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.results.value.length === 2)
    result.loadMore(1)
    await waitFor(() => result.results.value.length === 3)

    const callsBeforeRefresh = fetchMock.mock.calls.length
    holdNextFirstPage = true
    const refreshPromise = result.refresh()
    await waitFor(() => fetchMock.mock.calls.length === callsBeforeRefresh + 1)

    result.loadMore(1)
    await Promise.resolve()

    const pendingCursors = fetchMock.mock.calls.slice(callsBeforeRefresh).map((call) => {
      const init = call[1] as RequestInit | undefined
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      return body.args?.paginationOpts?.cursor ?? null
    })
    expect(pendingCursors).not.toContain('c2')

    responses.null = {
      page: [
        { _id: 'n1', title: 'A refreshed' },
        { _id: 'n2', title: 'B refreshed' },
      ],
      isDone: false,
      continueCursor: 'c1',
    }
    responses.c1 = {
      page: [{ _id: 'n3', title: 'C refreshed' }],
      isDone: false,
      continueCursor: 'c2',
    }
    inFlightRefresh.resolve({
      value: responses.null as PaginationResult<{ _id: string; title: string }>,
    })
    await refreshPromise

    expect((result.results.value as Array<{ _id: string }>).map((item) => item._id)).toEqual([
      'n1',
      'n2',
      'n3',
    ])

    result.loadMore(1)
    await waitFor(() => result.results.value.length === 4)
    expect((result.results.value as Array<{ _id: string }>).map((item) => item._id)).toEqual([
      'n1',
      'n2',
      'n3',
      'n4',
    ])
  })

  it('deduplicates concurrent refresh() calls', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:refresh-dedupe')
    const inFlightRefresh = deferred<{ value: PaginationResult<{ _id: string; title: string }> }>()
    let holdNextFirstPage = false
    const responses: Record<string, unknown> = {
      null: {
        page: [{ _id: 'n1', title: 'A' }],
        isDone: true,
        continueCursor: null,
      },
    }

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      const cursor = body.args?.paginationOpts?.cursor
      if ((cursor === null || cursor === undefined) && holdNextFirstPage) {
        holdNextFirstPage = false
        return inFlightRefresh.promise
      }
      return { value: responses.null }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 1, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.results.value.length === 1)
    const callsBeforeRefresh = fetchMock.mock.calls.length
    holdNextFirstPage = true

    const firstRefresh = result.refresh()
    await waitFor(() => fetchMock.mock.calls.length === callsBeforeRefresh + 1)
    const secondRefresh = result.refresh()
    await secondRefresh

    const firstPageCallsWhilePending = fetchMock.mock.calls
      .slice(callsBeforeRefresh)
      .filter((call) => {
        const init = call[1] as RequestInit | undefined
        const body = (init?.body ?? {}) as {
          args?: { paginationOpts?: { cursor?: string | null } }
        }
        const cursor = body.args?.paginationOpts?.cursor
        return cursor === null || cursor === undefined
      })
    expect(firstPageCallsWhilePending).toHaveLength(1)

    responses.null = {
      page: [{ _id: 'n1', title: 'A refreshed' }],
      isDone: true,
      continueCursor: null,
    }
    inFlightRefresh.resolve({
      value: responses.null as PaginationResult<{ _id: string; title: string }>,
    })
    await firstRefresh
    expect((result.results.value as Array<{ title: string }>)[0]?.title).toBe('A refreshed')
  })

  it('does not let stale refresh errors pollute a newer args view', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:refresh-stale-error')
    const oldRefreshFailure = deferred<never>()
    let failNextOldRefresh = false

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { status?: string; paginationOpts?: { cursor?: string | null } }
      }
      const status = body.args?.status
      const cursor = body.args?.paginationOpts?.cursor
      if (status === 'old' && (cursor === null || cursor === undefined) && failNextOldRefresh) {
        failNextOldRefresh = false
        return oldRefreshFailure.promise
      }
      return {
        value: {
          page: [{ _id: `${status ?? 'missing'}-1`, title: String(status) }],
          isDone: true,
          continueCursor: null,
        },
      }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result, flush } = await captureInNuxt(
      () => {
        const status = ref<'old' | 'new'>('old')
        const queryResult = useConvexPaginatedQueryState(
          query as never,
          () => ({ status: status.value }) as never,
          { initialNumItems: 1, subscribe: false },
        )
        return { status, queryResult }
      },
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.queryResult.results.value.length === 1)
    failNextOldRefresh = true
    const callsBeforeRefresh = fetchMock.mock.calls.length
    const staleRefresh = result.queryResult.refresh()
    await waitFor(() => fetchMock.mock.calls.length === callsBeforeRefresh + 1)

    result.status.value = 'new'
    await flush()
    await waitFor(
      () => (result.queryResult.results.value as Array<{ _id: string }>)[0]?._id === 'new-1',
    )

    oldRefreshFailure.reject(new Error('old refresh failed'))
    await staleRefresh
    await flush()

    expect(result.queryResult.error.value).toBeNull()
    expect(result.queryResult.status.value).toBe('exhausted')
    expect((result.queryResult.results.value as Array<{ _id: string }>)[0]?._id).toBe('new-1')
  })

  it('routes refresh() failures through unauthorized recovery', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:refresh-unauthorized')
    let failRefresh = false
    const unauthorized = new Error('Unauthenticated')
    const fetchMock = vi.fn(async () => {
      if (failRefresh) throw unauthorized
      return {
        value: {
          page: [{ _id: 'n1', title: 'A' }],
          isDone: true,
          continueCursor: null,
        },
      }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 1, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.results.value.length === 1)
    failRefresh = true
    await result.refresh()

    expect(handleUnauthorizedMock).toHaveBeenCalledWith({
      error: unauthorized,
      source: 'query',
      functionName: 'notes:listPaginated:refresh-unauthorized',
    })
    expect(result.error.value?.message).toBe('Unauthenticated')
  })

  it('reset() starts over from first page with a new pagination id', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:reset')
    const firstPageIds: number[] = []

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null; id?: number } }
      }
      const cursor = body.args?.paginationOpts?.cursor
      const id = body.args?.paginationOpts?.id

      if (cursor === null && typeof id === 'number') {
        firstPageIds.push(id)
      }

      if (cursor === null) {
        return {
          value: {
            page: [{ _id: 'n1', title: 'A' }],
            isDone: false,
            continueCursor: 'c1',
          },
        }
      }

      return {
        value: {
          page: [{ _id: 'n2', title: 'B' }],
          isDone: true,
          continueCursor: null,
        },
      }
    })

    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 1, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.results.value.length === 1)

    result.loadMore(1)
    await waitFor(() => result.results.value.length === 2)

    await result.reset()

    await waitFor(() => result.results.value.length === 1)
    const resetResults = result.results.value as Array<{ _id: string }>
    expect(resetResults.map((item) => item._id)).toEqual(['n1'])

    expect(firstPageIds.length).toBeGreaterThanOrEqual(2)
    expect(firstPageIds[0]).not.toBe(firstPageIds[firstPageIds.length - 1])
  })

  it('reset() is the only reset primitive exposed (no clear)', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:shape')
    const { result } = await captureInNuxt(
      () => useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2 }),
      { convex: new MockConvexClient() },
    )

    expect(typeof result.reset).toBe('function')
    expect('clear' in (result as unknown as Record<string, unknown>)).toBe(false)
    expect('isLoadingFirstPage' in (result as unknown as Record<string, unknown>)).toBe(false)
    expect('isLoadingMore' in (result as unknown as Record<string, unknown>)).toBe(false)
    expect('isRefreshing' in (result as unknown as Record<string, unknown>)).toBe(false)
  })

  it('applies transform on concatenated pages and subsequent updates', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:transform')

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(
          query,
          {},
          {
            initialNumItems: 2,
            transform: (items: Array<{ _id: string; title: string }>) =>
              items.map((item) => `${item._id}:${String(item.title)}`),
          },
        ),
      { convex },
    )

    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts
          ?.cursor
        return path === 'notes:listPaginated:transform' && cursor === null
      },
      {
        page: [
          { _id: 'n1', title: 'A' },
          { _id: 'n2', title: 'B' },
        ],
        isDone: false,
        continueCursor: 'c1',
      },
    )

    await waitFor(() => result.results.value.length === 2)

    result.loadMore(2)
    await waitFor(() =>
      convex.calls.onUpdate.some((call) => {
        const args = call.args as { paginationOpts?: { cursor?: string | null } }
        return args.paginationOpts?.cursor === 'c1'
      }),
    )
    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts
          ?.cursor
        return path === 'notes:listPaginated:transform' && cursor === 'c1'
      },
      {
        page: [{ _id: 'n3', title: 'C' }],
        isDone: true,
        continueCursor: null,
      },
    )

    await waitFor(() => result.results.value.length === 3)
    expect(result.results.value).toEqual(['n1:A', 'n2:B', 'n3:C'])

    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts
          ?.cursor
        return path === 'notes:listPaginated:transform' && cursor === null
      },
      {
        page: [
          { _id: 'n1', title: 'A*' },
          { _id: 'n2', title: 'B' },
        ],
        isDone: false,
        continueCursor: 'c1',
      },
    )

    await waitFor(() => result.results.value[0] === 'n1:A*')
    expect(result.results.value).toEqual(['n1:A*', 'n2:B', 'n3:C'])
  })

  it('shares first-page paginated subscriptions across consumers without dropping updates', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:first-page-dedup')

    const { result } = await captureInNuxt(
      () => {
        const first = useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2 })
        const second = useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2 })
        return { first, second }
      },
      { convex },
    )

    await waitFor(() => convex.activeListenerCount() === 1)
    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts
          ?.cursor
        return path === 'notes:listPaginated:first-page-dedup' && cursor === null
      },
      {
        page: [{ _id: 'n1', title: 'Initial' }],
        isDone: false,
        continueCursor: 'c1',
      },
    )

    await waitFor(
      () => result.first.results.value.length === 1 && result.second.results.value.length === 1,
    )
    await waitFor(() => convex.activeListenerCount() === 1)

    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts
          ?.cursor
        return path === 'notes:listPaginated:first-page-dedup' && cursor === null
      },
      {
        page: [{ _id: 'n1', title: 'Updated' }],
        isDone: false,
        continueCursor: 'c1',
      },
    )

    await waitFor(
      () =>
        (result.first.results.value as Array<{ title: string }>)[0]?.title === 'Updated' &&
        (result.second.results.value as Array<{ title: string }>)[0]?.title === 'Updated',
    )
  })

  it('keeps loading-first-page contract for server options until first data', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:blocking-server')

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(
          query as never,
          {},
          {
            initialNumItems: 2,
            server: false,
          },
        ),
      { convex },
    )

    expect(result.isLoading.value).toBe(true)

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('notes:listPaginated:blocking-server', {
      page: [{ _id: 'n1', title: 'A' }],
      isDone: true,
      continueCursor: null,
    })

    await waitFor(() => result.status.value === 'exhausted')
  })

  it('keepPreviousData keeps previous rows while first page refreshes on args changes', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:keep-previous')

    const { result, flush } = await captureInNuxt(
      () => {
        const status = ref<'active' | 'archived'>('active')
        const queryResult = useConvexPaginatedQueryState(
          query as never,
          () => ({ status: status.value }) as never,
          { initialNumItems: 2, keepPreviousData: true },
        )
        return { status, queryResult }
      },
      { convex },
    )

    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const a = args as { status?: string; paginationOpts?: { cursor?: string | null } }
        return (
          path === 'notes:listPaginated:keep-previous' &&
          a.status === 'active' &&
          a.paginationOpts?.cursor === null
        )
      },
      {
        page: [{ _id: 'n1', title: 'Active A' }],
        isDone: true,
        continueCursor: null,
      },
    )

    await waitFor(() => result.queryResult.results.value.length === 1)
    expect((result.queryResult.results.value as Array<{ title: string }>)[0]).toMatchObject({
      title: 'Active A',
    })

    result.status.value = 'archived'
    await flush()

    expect(result.queryResult.status.value).toBe('loading-first-page')
    expect(result.queryResult.isLoading.value).toBe(true)
    expect(result.queryResult.isStale.value).toBe(true)
    expect((result.queryResult.results.value as Array<{ title: string }>)[0]).toMatchObject({
      title: 'Active A',
    })

    await waitFor(
      () =>
        convex.activeListenerCountWhere(({ query: q, args }) => {
          const path = (q as { _path?: string })._path
          const a = args as { status?: string; paginationOpts?: { cursor?: string | null } }
          return (
            path === 'notes:listPaginated:keep-previous' &&
            a.status === 'archived' &&
            a.paginationOpts?.cursor === null
          )
        }) === 1,
    )

    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const a = args as { status?: string; paginationOpts?: { cursor?: string | null } }
        return (
          path === 'notes:listPaginated:keep-previous' &&
          a.status === 'archived' &&
          a.paginationOpts?.cursor === null
        )
      },
      {
        page: [{ _id: 'n2', title: 'Archived B' }],
        isDone: true,
        continueCursor: null,
      },
    )

    await waitFor(
      () =>
        (result.queryResult.results.value as Array<{ title: string }>)[0]?.title === 'Archived B',
    )
    expect(result.queryResult.isLoading.value).toBe(false)
    expect(result.queryResult.isStale.value).toBe(false)
  })

  it('refresh() recovers from error back to ready/exhausted', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:error-recovery')
    let firstRequest = true
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      const cursor = body.args?.paginationOpts?.cursor
      if (cursor === null && firstRequest) {
        firstRequest = false
        throw new Error('first page failed')
      }
      return {
        value: {
          page: [{ _id: 'n1', title: 'Recovered' }],
          isDone: true,
          continueCursor: null,
        },
      }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.status.value === 'error')
    expect(result.error.value?.message).toContain('first page failed')

    const refreshPromise = result.refresh()
    await waitFor(() => result.status.value === 'loading-first-page')
    await refreshPromise
    await waitFor(() => result.status.value === 'exhausted')
    expect((result.results.value as Array<{ title: string }>)[0]?.title).toBe('Recovered')
  })

  it('reset() recovers from error and restarts first page load', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:error-reset')
    let firstRequest = true
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      const cursor = body.args?.paginationOpts?.cursor
      if (cursor === null && firstRequest) {
        firstRequest = false
        throw new Error('initial failed')
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
      return {
        value: {
          page: [{ _id: 'n1', title: 'Recovered after reset' }],
          isDone: true,
          continueCursor: null,
        },
      }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.status.value === 'error')

    const resetPromise = result.reset()
    await waitFor(() => result.status.value === 'loading-first-page')
    await resetPromise
    await waitFor(() => result.status.value === 'exhausted')
    expect((result.results.value as Array<{ title: string }>)[0]?.title).toBe(
      'Recovered after reset',
    )
  })

  it('discards stale loadMore results after reset changes the pagination id', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:stale-load-more')
    const oldLoadMore = deferred<{ value: PaginationResult<{ _id: string; title: string }> }>()

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null } }
      }
      const cursor = body.args?.paginationOpts?.cursor

      if (cursor === 'c1') {
        return await oldLoadMore.promise
      }

      return {
        value: {
          page: [{ _id: 'n1', title: 'First page' }],
          isDone: false,
          continueCursor: 'c1',
        },
      }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 1, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.results.value.length === 1)
    result.loadMore(1)
    await waitFor(() => result.status.value === 'loading-more')

    await result.reset()
    await waitFor(() => result.results.value.length === 1)

    oldLoadMore.resolve({
      value: {
        page: [{ _id: 'old', title: 'Stale page' }],
        isDone: true,
        continueCursor: '',
      },
    })

    await Promise.resolve()
    expect(result.results.value).toEqual([{ _id: 'n1', title: 'First page' }])
  })

  it('applies transform to initial placeholder rows', async () => {
    const convex = new MockConvexClient()
    type InitialTransformItem = { _id: string; title: string }
    const query = mockFnRef<'query'>(
      'notes:listPaginated:initial-data-transform',
    ) as unknown as FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions },
      PaginationResult<InitialTransformItem>
    >

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(
          query as never,
          {},
          {
            initialNumItems: 2,
            server: false,
            initialData: [{ _id: 'placeholder', title: 'loading' }] as never[],
            transform: (items: InitialTransformItem[]) =>
              items.map((item) => ({ ...item, title: item.title.toUpperCase() })),
          },
        ),
      { convex },
    )

    expect(result.results.value).toEqual([{ _id: 'placeholder', title: 'LOADING' }])
    expect(result.status.value).toBe('loading-first-page')
  })
})
