import type { PaginationResult } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { ConvexCallError } from '../../src/runtime/errors'
import {
  commitPaginatedPageError,
  commitPaginatedPageResult,
  createPendingPaginatedPage,
  getLastLoadedPaginatedResult,
  type PaginatedPageState,
} from '../../src/runtime/utils/paginated-query-pages'

function pageResult<T>(page: T[], isDone = false): PaginationResult<T> {
  return {
    page,
    isDone,
    continueCursor: isDone ? '' : 'next',
    splitCursor: null,
    pageStatus: isDone ? null : 'SplitRequired',
  }
}

describe('paginated query page state', () => {
  it('creates a pending page with no result or error', () => {
    const pending = createPendingPaginatedPage({ numItems: 10, cursor: 'c1', id: 7 })

    expect(pending).toMatchObject({
      paginationOpts: { numItems: 10, cursor: 'c1', id: 7 },
      result: undefined,
      error: null,
      pending: true,
      unsubscribe: null,
    })
  })

  it('commits results immutably while preserving unsubscribe handles', () => {
    const unsubscribe = vi.fn()
    const pages: PaginatedPageState<string>[] = [
      { ...createPendingPaginatedPage({ numItems: 1, cursor: 'a', id: 1 }), unsubscribe },
    ]
    const result = pageResult(['a'])

    const nextPages = commitPaginatedPageResult(pages, 0, result)

    expect(nextPages).not.toBe(pages)
    expect(nextPages[0]).toMatchObject({
      result,
      error: null,
      pending: false,
      unsubscribe,
    })
    expect(pages[0]?.pending).toBe(true)
  })

  it('commits errors immutably without dropping existing page results', () => {
    const result = pageResult(['a'])
    const pages = commitPaginatedPageResult(
      [createPendingPaginatedPage<string>({ numItems: 1, cursor: 'a', id: 1 })],
      0,
      result,
    )
    const error = new Error('boom')

    const nextPages = commitPaginatedPageError(pages, 0, error)

    expect(nextPages).not.toBe(pages)
    expect(nextPages[0]?.result).toBe(result)
    // Page errors are normalized to ConvexCallError at the boundary (vNext §7);
    // a plain Error stays `unknown` with its message preserved and the raw error
    // retained as the runtime-only cause.
    expect(nextPages[0]?.error).toBeInstanceOf(ConvexCallError)
    expect(nextPages[0]?.error?.kind).toBe('unknown')
    expect(nextPages[0]?.error?.message).toBe('boom')
    expect(nextPages[0]?.error?.cause).toBe(error)
    expect(nextPages[0]?.pending).toBe(false)
  })

  it('returns the first page until additional pages exist and ignores pending tails', () => {
    const firstPage = pageResult(['first'])
    const loadedPage = {
      ...createPendingPaginatedPage<string>({ numItems: 1, cursor: 'b', id: 1 }),
      result: pageResult(['second']),
      pending: false,
    }
    const pendingPage = createPendingPaginatedPage<string>({ numItems: 1, cursor: 'c', id: 1 })

    expect(getLastLoadedPaginatedResult(firstPage, [])).toBe(firstPage)
    expect(getLastLoadedPaginatedResult(firstPage, [loadedPage])).toBe(loadedPage.result)
    expect(getLastLoadedPaginatedResult(firstPage, [loadedPage, pendingPage])).toBeUndefined()
  })
})
