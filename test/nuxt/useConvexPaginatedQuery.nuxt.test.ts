import { describe, expect, it } from 'vitest'

import { useConvexPaginatedQuery } from '../../src/runtime/composables/useConvexPaginatedQuery'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { waitFor } from '../helpers/wait-for'

describe('useConvexPaginatedQuery (Nuxt runtime)', () => {
  it('returns exhausted + not loading for static skip', async () => {
    const query = mockFnRef<'query'>('notes:listPaginated')
    const { result } = await captureInNuxt(
      () => useConvexPaginatedQuery(query as never, 'skip', { initialNumItems: 3 }),
      { convex: new MockConvexClient() },
    )

    expect(result.status.value).toBe('Exhausted')
    expect(result.isLoading.value).toBe(false)
    expect(result.results.value).toEqual([])
  })

  it('loads first page and supports loadMore transitions', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated')

    const { result } = await captureInNuxt(
      () => useConvexPaginatedQuery(query as never, {}, { initialNumItems: 2 }),
      { convex },
    )

    convex.emitQueryResultWhere(({ query: q, args }) => {
      const path = (q as { _path?: string })._path
      const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts?.cursor
      return path === 'notes:listPaginated' && cursor === null
    }, {
      page: [
        { _id: 'n1', title: 'A' },
        { _id: 'n2', title: 'B' },
      ],
      isDone: false,
      continueCursor: 'c1',
    })

    await waitFor(() => result.results.value.length === 2, { timeoutMs: 1000 })
    expect(result.status.value).toBe('CanLoadMore')

    result.loadMore(2)

    convex.emitQueryResultWhere(({ query: q, args }) => {
      const path = (q as { _path?: string })._path
      const cursor = (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts?.cursor
      return path === 'notes:listPaginated' && cursor === 'c1'
    }, {
      page: [{ _id: 'n3', title: 'C' }],
      isDone: true,
      continueCursor: 'c2',
    })

    await waitFor(() => result.results.value.length === 3, { timeoutMs: 1000 })
    expect(result.results.value.map(item => item._id)).toEqual(['n1', 'n2', 'n3'])
    expect(result.status.value).toBe('Exhausted')
  })

  it('applies transform on concatenated results', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:listPaginated')

    const { result } = await captureInNuxt(() => useConvexPaginatedQuery(
      query as never,
      {},
      {
        initialNumItems: 2,
        transform: items => items.map(item => ({ id: item._id, label: String(item.title) })),
      },
    ), { convex })

    convex.emitQueryResultByPath('notes:listPaginated', {
      page: [
        { _id: 'n1', title: 'A' },
        { _id: 'n2', title: 'B' },
      ],
      isDone: true,
      continueCursor: null,
    })

    await waitFor(() => result.results.value.length === 2, { timeoutMs: 1000 })
    expect(result.results.value).toEqual([
      { id: 'n1', label: 'A' },
      { id: 'n2', label: 'B' },
    ])
  })
})

