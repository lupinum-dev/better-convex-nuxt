import { afterEach, describe, expect, it, vi } from 'vitest'

import { useConvexPaginatedQuery } from '../../src/runtime/composables/useConvexPaginatedQuery'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { waitFor } from '../helpers/wait-for'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useConvexPaginatedQuery (Nuxt runtime)', () => {
  it('returns exhausted + not loading for static skip', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:skip-static')
    const { result } = await captureInNuxt(
      () => useConvexPaginatedQuery(query as never, 'skip', { initialNumItems: 3 }),
      { convex: new MockConvexClient() },
    )

    expect(result.status.value).toBe('Exhausted')
    expect(result.isLoading.value).toBe(false)
    expect(result.results.value).toEqual([])
  })

  it('walks the full status machine: LoadingFirstPage -> CanLoadMore -> LoadingMore -> Exhausted', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:state-machine')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQuery(query as never, {}, { initialNumItems: 2 }),
      { convex },
    )

    expect(result.status.value).toBe('LoadingFirstPage')

    convex.emitQueryResultWhere(({ query: q, args }) => {
      const path = (q as { _path?: string })._path
      const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts?.cursor
      return path === 'notes:listPaginated:state-machine' && cursor === null
    }, {
      page: [
        { _id: 'n1', title: 'A' },
        { _id: 'n2', title: 'B' },
      ],
      isDone: false,
      continueCursor: 'c1',
    })

    await waitFor(() => result.status.value === 'CanLoadMore')

    result.loadMore(2)
    await waitFor(() => result.status.value === 'LoadingMore')
    await waitFor(() => convex.calls.onUpdate.some((call) => {
      const args = call.args as { paginationOpts?: { cursor?: string | null } }
      return args.paginationOpts?.cursor === 'c1'
    }))

    convex.emitQueryResultWhere(({ query: q, args }) => {
      const path = (q as { _path?: string })._path
      const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts?.cursor
      return path === 'notes:listPaginated:state-machine' && cursor === 'c1'
    }, {
      page: [{ _id: 'n3', title: 'C' }],
      isDone: true,
      continueCursor: null,
    })

    await waitFor(() => result.status.value === 'Exhausted')
    expect(result.results.value.map(item => item._id)).toEqual(['n1', 'n2', 'n3'])
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
      () => useConvexPaginatedQuery(query as never, {}, { initialNumItems: 2, subscribe: false }),
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
      return result.results.value[0]?.title === 'A (refreshed)'
        && result.results.value[2]?.title === 'C (refreshed)'
    })
  })

  it('reset() starts over from first page with a new pagination id', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated:reset')
    const firstPageIds: number[] = []

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as {
        args?: { paginationOpts?: { cursor?: string | null, id?: number } }
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
      () => useConvexPaginatedQuery(query as never, {}, { initialNumItems: 1, subscribe: false }),
      { convex: new MockConvexClient() },
    )

    await waitFor(() => result.results.value.length === 1)

    result.loadMore(1)
    await waitFor(() => result.results.value.length === 2)

    await result.reset()

    await waitFor(() => result.results.value.length === 1)
    expect(result.results.value.map(item => item._id)).toEqual(['n1'])

    expect(firstPageIds.length).toBeGreaterThanOrEqual(2)
    expect(firstPageIds[0]).not.toBe(firstPageIds[firstPageIds.length - 1])
  })

  it('clear() drops results and active subscriptions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:clear')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQuery(query as never, {}, { initialNumItems: 2 }),
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('notes:listPaginated:clear', {
      page: [{ _id: 'n1', title: 'A' }],
      isDone: true,
      continueCursor: null,
    })

    await waitFor(() => result.results.value.length === 1)
    result.clear()

    expect(result.results.value).toEqual([])
    expect(result.status.value).toBe('LoadingFirstPage')
    expect(result.isLoading.value).toBe(true)
  })

  it('applies transform on concatenated pages and subsequent updates', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:transform')

    const { result } = await captureInNuxt(() => useConvexPaginatedQuery(
      query as never,
      {},
      {
        initialNumItems: 2,
        transform: items => items.map(item => `${item._id}:${String(item.title)}`),
      },
    ), { convex })

    convex.emitQueryResultWhere(({ query: q, args }) => {
      const path = (q as { _path?: string })._path
      const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts?.cursor
      return path === 'notes:listPaginated:transform' && cursor === null
    }, {
      page: [
        { _id: 'n1', title: 'A' },
        { _id: 'n2', title: 'B' },
      ],
      isDone: false,
      continueCursor: 'c1',
    })

    await waitFor(() => result.results.value.length === 2)

    result.loadMore(2)
    await waitFor(() => convex.calls.onUpdate.some((call) => {
      const args = call.args as { paginationOpts?: { cursor?: string | null } }
      return args.paginationOpts?.cursor === 'c1'
    }))
    convex.emitQueryResultWhere(({ query: q, args }) => {
      const path = (q as { _path?: string })._path
      const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts?.cursor
      return path === 'notes:listPaginated:transform' && cursor === 'c1'
    }, {
      page: [{ _id: 'n3', title: 'C' }],
      isDone: true,
      continueCursor: null,
    })

    await waitFor(() => result.results.value.length === 3)
    expect(result.results.value).toEqual(['n1:A', 'n2:B', 'n3:C'])

    convex.emitQueryResultWhere(({ query: q, args }) => {
      const path = (q as { _path?: string })._path
      const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts?.cursor
      return path === 'notes:listPaginated:transform' && cursor === null
    }, {
      page: [
        { _id: 'n1', title: 'A*' },
        { _id: 'n2', title: 'B' },
      ],
      isDone: false,
      continueCursor: 'c1',
    })

    await waitFor(() => result.results.value[0] === 'n1:A*')
    expect(result.results.value).toEqual(['n1:A*', 'n2:B', 'n3:C'])
  })

  it('keeps LoadingFirstPage contract for lazy/server options until first data', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated:lazy-server')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQuery(query as never, {}, {
        initialNumItems: 2,
        server: false,
        lazy: true,
      }),
      { convex },
    )

    expect(result.isLoading.value).toBe(true)

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('notes:listPaginated:lazy-server', {
      page: [{ _id: 'n1', title: 'A' }],
      isDone: true,
      continueCursor: null,
    })

    await waitFor(() => result.status.value === 'Exhausted')
  })
})
