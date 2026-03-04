import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { FunctionReference, PaginationOptions, PaginationResult } from 'convex/server'
import type { MaybeRefOrGetter } from 'vue'

import {
  createConvexPaginatedQueryState,
  useConvexPaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryReference,
  type PaginatedQueryItem,
  type UseConvexPaginatedQueryOptions,
} from '../../src/runtime/composables/useConvexPaginatedQuery'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

function useConvexPaginatedQueryState<
  Query extends PaginatedQueryReference,
  Args extends PaginatedQueryArgs<Query> | null | undefined = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
) {
  return createConvexPaginatedQueryState<Query, Args, TransformedItem>(
    query,
    args,
    options,
    true,
  ).resultData
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useConvexPaginatedQuery composables (Nuxt runtime)', () => {
  it('useConvexPaginatedQuery blocks until the first page arrives', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:blocking-default')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQuery(query as never, {}, { initialNumItems: 2 }),
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

  it('returns idle + not loading for disabled nullable args', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:disabled-static')
    const { result } = await captureInNuxt(
      () => useConvexPaginatedQueryState(query as never, null, { initialNumItems: 3 }),
      { convex: new MockConvexClient() },
    )

    expect(result.status.value).toBe('idle')
    expect(result.isLoading.value).toBe(false)
    expect(result.results.value).toEqual([])
  })

  it('respects enabled:false and does not start subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:enabled-false')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 3, enabled: false }),
      { convex },
    )

    expect(result.status.value).toBe('idle')
    expect(result.isLoading.value).toBe(false)
    expect(result.hasNextPage.value).toBe(false)
    expect(convex.calls.onUpdate.length).toBe(0)
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
      () => useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2, subscribe: false }),
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
      () => useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 1, subscribe: false }),
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

    const { result, flush } = await captureInNuxt(() => {
      const status = ref<'active' | 'archived'>('active')
      const queryResult = useConvexPaginatedQueryState(
        query as never,
        () => ({ status: status.value }) as never,
        { initialNumItems: 2, keepPreviousData: true },
      )
      return { status, queryResult }
    }, { convex })

    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const a = args as { status?: string; paginationOpts?: { cursor?: string | null } }
        return path === 'notes:listPaginated:keep-previous'
          && a.status === 'active'
          && a.paginationOpts?.cursor === null
      },
      {
        page: [{ _id: 'n1', title: 'Active A' }],
        isDone: true,
        continueCursor: null,
      },
    )

    await waitFor(() => result.queryResult.results.value.length === 1)
    expect((result.queryResult.results.value as Array<{ title: string }>)[0]).toMatchObject({ title: 'Active A' })

    result.status.value = 'archived'
    await flush()

    expect(result.queryResult.status.value).toBe('loading-first-page')
    expect(result.queryResult.isLoading.value).toBe(true)
    expect((result.queryResult.results.value as Array<{ title: string }>)[0]).toMatchObject({ title: 'Active A' })

    convex.emitQueryResultWhere(
      ({ query: q, args }) => {
        const path = (q as { _path?: string })._path
        const a = args as { status?: string; paginationOpts?: { cursor?: string | null } }
        return path === 'notes:listPaginated:keep-previous'
          && a.status === 'archived'
          && a.paginationOpts?.cursor === null
      },
      {
        page: [{ _id: 'n2', title: 'Archived B' }],
        isDone: true,
        continueCursor: null,
      },
    )

    await waitFor(() =>
      (result.queryResult.results.value as Array<{ title: string }>)[0]?.title === 'Archived B',
    )
    expect(result.queryResult.isLoading.value).toBe(false)
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
      () => useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2, subscribe: false }),
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
      await new Promise(resolve => setTimeout(resolve, 10))
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
      () => useConvexPaginatedQueryState(query as never, {}, { initialNumItems: 2, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.status.value === 'error')

    const resetPromise = result.reset()
    await waitFor(() => result.status.value === 'loading-first-page')
    await resetPromise
    await waitFor(() => result.status.value === 'exhausted')
    expect((result.results.value as Array<{ title: string }>)[0]?.title).toBe('Recovered after reset')
  })

  it('applies transform to default placeholder rows', async () => {
    const convex = new MockConvexClient()
    type DefaultTransformItem = { _id: string; title: string }
    const query = mockFnRef<'query'>(
      'notes:listPaginated:default-transform',
    ) as unknown as FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions },
      PaginationResult<DefaultTransformItem>
    >

    const { result } = await captureInNuxt(
      () =>
        useConvexPaginatedQueryState(
          query as never,
          {},
          {
            initialNumItems: 2,
            server: false,
            default: () => [{ _id: 'placeholder', title: 'loading' }] as never[],
            transform: (items: DefaultTransformItem[]) =>
              items.map(item => ({ ...item, title: item.title.toUpperCase() })),
          },
        ),
      { convex },
    )

    expect(result.results.value).toEqual([{ _id: 'placeholder', title: 'LOADING' }])
    expect(result.status.value).toBe('loading-first-page')
  })
})
