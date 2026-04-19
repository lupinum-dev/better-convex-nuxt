import { describe, expect, it } from 'vitest'

import {
  createPaginatedWatchSource,
  createRuntimePaginationPage,
  createSkippedPaginatedCacheKey,
  markRuntimePaginationPagesRefreshing,
  resolveRuntimePaginationError,
  shouldPersistSettledPaginatedResults,
  updateRuntimePaginationPage,
} from '../../src/runtime/convex/pagination/pagination-page-state'

describe('pagination-page-state', () => {
  it('creates stable skipped cache keys and watch-source identifiers', () => {
    expect(createSkippedPaginatedCacheKey('posts:list')).toBe('convex-paginated:skipped:posts:list')
    expect(createPaginatedWatchSource('hash-a', false, 4)).toBe('hash-a:enabled:4')
    expect(createPaginatedWatchSource('hash-a', true, 4)).toBe('hash-a:skipped:4')
  })

  it('creates and updates runtime page state immutably', () => {
    const page = createRuntimePaginationPage<string>({ numItems: 10, cursor: 'abc', id: 2 })
    expect(page).toEqual({
      paginationOpts: { numItems: 10, cursor: 'abc', id: 2 },
      result: null,
      error: null,
      pending: true,
      subscription: null,
    })

    const updated = updateRuntimePaginationPage([page], 0, (current) => ({
      ...current,
      pending: false,
      result: { page: ['a'], isDone: false, continueCursor: 'next' },
    }))

    expect(updated[0]?.pending).toBe(false)
    expect(updated[0]?.result?.page).toEqual(['a'])
    expect(updateRuntimePaginationPage([page], 9, (current) => current)).toEqual([page])
  })

  it('marks pages refreshing, resolves errors, and persists settled results only after first-page loading ends', () => {
    const pages = [
      {
        paginationOpts: { numItems: 2, cursor: null, id: 1 },
        result: { page: ['a'], isDone: false, continueCursor: 'next' },
        error: new Error('page boom'),
        pending: false,
        subscription: null,
      },
    ]

    const refreshing = markRuntimePaginationPagesRefreshing(pages)
    expect(refreshing[0]?.pending).toBe(true)
    expect(refreshing[0]?.error).toBeNull()

    expect(resolveRuntimePaginationError(new Error('global'), null, pages)?.message).toBe('global')
    expect(resolveRuntimePaginationError(null, new Error('first'), pages)?.message).toBe('first')
    expect(resolveRuntimePaginationError(null, null, pages)?.message).toBe('page boom')
    expect(resolveRuntimePaginationError(null, null, refreshing)).toBeNull()

    expect(shouldPersistSettledPaginatedResults(false, 'ready')).toBe(true)
    expect(shouldPersistSettledPaginatedResults(false, 'exhausted')).toBe(true)
    expect(shouldPersistSettledPaginatedResults(false, 'loading-first-page')).toBe(false)
    expect(shouldPersistSettledPaginatedResults(true, 'ready')).toBe(false)
  })
})
