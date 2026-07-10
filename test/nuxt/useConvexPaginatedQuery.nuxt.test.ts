import type { PaginationResult } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useState } from '#imports'

import { createConvexPaginatedQueryState } from '../../src/runtime/composables/useConvexPaginatedQuery'
import { makeMockOwner } from '../helpers/mock-client-owner'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

afterEach(() => {
  vi.clearAllMocks()
})

function page<T>(items: T[], isDone: boolean, cursor: string | null): PaginationResult<T> {
  return { page: items, isDone, continueCursor: cursor ?? '' } as PaginationResult<T>
}

// vNext §6 / internal §7.6: the pagination controller owns first- and later-page
// acquisition through composable-owned listeners, and clears its pages on an
// identity change.
describe('useConvexPaginatedQuery controller', () => {
  it('loads the first page live, then appends a page via loadMore', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('feed:list')

    const { result, flush, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => false)
        const user = useState<{ id: string } | null>('convex:user', () => null)
        pending.value = false
        user.value = { id: 'A' }
        const q = createConvexPaginatedQueryState(
          query,
          {},
          { auth: 'optional', initialNumItems: 2 },
          true,
        ).resultData
        return { q, pending, user }
      },
      { owner: makeMockOwner(primary) },
    )

    await flush()
    expect(primary.calls.onUpdate.length).toBe(1)

    // First page arrives.
    primary.emitQueryResultWhere(
      (e) =>
        (e.args as { paginationOpts: { cursor: string | null } }).paginationOpts.cursor === null,
      page(['a', 'b'], false, 'cursor-1'),
    )
    await flush()
    expect(result.q.results.value).toEqual(['a', 'b'])
    expect(result.q.hasNextPage.value).toBe(true)

    // Load the next page: a second listener is acquired for the continue cursor.
    result.q.loadMore(2)
    await flush()
    expect(primary.calls.onUpdate.length).toBe(2)

    primary.emitQueryResultWhere(
      (e) =>
        (e.args as { paginationOpts: { cursor: string | null } }).paginationOpts.cursor ===
        'cursor-1',
      page(['c', 'd'], true, 'cursor-2'),
    )
    await flush()
    expect(result.q.results.value).toEqual(['a', 'b', 'c', 'd'])
    expect(result.q.status.value).toBe('exhausted')

    wrapper.unmount()
  })

  it('clears pages and re-acquires the first page on an identity change', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('feed:mine')

    const { result, flush, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => false)
        const user = useState<{ id: string } | null>('convex:user', () => null)
        pending.value = false
        user.value = { id: 'A' }
        const q = createConvexPaginatedQueryState(
          query,
          {},
          { auth: 'optional', initialNumItems: 2, keepPreviousData: true },
          true,
        ).resultData
        return { q, pending, user }
      },
      { owner: makeMockOwner(primary) },
    )

    await flush()
    primary.emitQueryResultWhere(() => true, page(['a1', 'a2'], false, 'c1'))
    await flush()
    expect(result.q.results.value).toEqual(['a1', 'a2'])

    // Switch identity: pages cleared, no A rows carried across.
    result.user.value = { id: 'B' }
    await flush()
    expect(result.q.results.value).toEqual([])

    // B's first page acquires a fresh listener and commits under B.
    primary.emitQueryResultWhere(() => true, page(['b1'], true, 'c2'))
    await flush()
    expect(result.q.results.value).toEqual(['b1'])

    wrapper.unmount()
  })

  it('routes an authenticated none paginated query through the anonymous client', async () => {
    const primary = new MockConvexClient()
    const anon = new MockConvexClient()
    const query = mockFnRef<'query'>('feed:public')

    const { flush, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => false)
        const user = useState<{ id: string } | null>('convex:user', () => null)
        pending.value = false
        user.value = { id: 'A' }
        return createConvexPaginatedQueryState(
          query,
          {},
          { auth: 'none', initialNumItems: 2 },
          true,
        ).resultData
      },
      { owner: makeMockOwner(primary, anon) },
    )

    await flush()
    expect(anon.calls.onUpdate.length).toBe(1)
    expect(primary.calls.onUpdate.length).toBe(0)

    wrapper.unmount()
  })
})
