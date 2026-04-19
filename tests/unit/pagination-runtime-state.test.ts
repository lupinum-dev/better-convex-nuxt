import { describe, expect, it } from 'vitest'

import {
  createLoadMoreBootstrap,
  createPaginationOperationContext,
  createPaginationResetState,
  createStablePaginatedSubscriptionKey,
} from '../../src/runtime/convex/pagination/pagination-runtime-state'

describe('pagination-runtime-state', () => {
  it('creates stable subscription keys and paginated devtools metadata', () => {
    expect(
      createStablePaginatedSubscriptionKey({
        isSkipped: true,
        firstPageCacheKey: 'convex-paginated:skipped:tasks.list',
        queryKey: 'ignored',
      }),
    ).toBe('paginated:convex-paginated:skipped:tasks.list:idle')

    expect(
      createStablePaginatedSubscriptionKey({
        isSkipped: false,
        firstPageCacheKey: 'ignored',
        queryKey: 'tasks.list:hash',
      }),
    ).toBe('paginated:tasks.list:hash')

    expect(createPaginationOperationContext({ numItems: 10, cursor: 'next' }, 'op-1', 2)).toEqual({
      operationId: 'op-1',
      meta: {
        paginated: true,
        page: 4,
        numItems: 10,
        cursor: 'next',
      },
    })
  })

  it('builds load-more state only when pagination can advance', () => {
    expect(
      createLoadMoreBootstrap({
        isSkipped: true,
        firstPage: { page: ['a'], isDone: false, continueCursor: 'next' },
        pages: [],
        numItems: 5,
        paginationId: 9,
      }),
    ).toBeNull()

    expect(
      createLoadMoreBootstrap({
        isSkipped: false,
        firstPage: { page: ['a'], isDone: true, continueCursor: 'next' },
        pages: [],
        numItems: 5,
        paginationId: 9,
      }),
    ).toBeNull()

    expect(
      createLoadMoreBootstrap({
        isSkipped: false,
        firstPage: { page: ['a'], isDone: false, continueCursor: 'next' },
        pages: [
          {
            paginationOpts: { numItems: 5, cursor: 'next', id: 9 },
            result: null,
            error: null,
            pending: true,
            subscription: null,
          },
        ],
        numItems: 5,
        paginationId: 9,
      }),
    ).toBeNull()

    expect(
      createLoadMoreBootstrap({
        isSkipped: false,
        firstPage: { page: ['a'], isDone: false, continueCursor: 'next' },
        pages: [],
        numItems: 5,
        paginationId: 9,
      }),
    ).toEqual({
      pageIndex: 0,
      newPage: {
        paginationOpts: { numItems: 5, cursor: 'next', id: 9 },
        result: null,
        error: null,
        pending: true,
        subscription: null,
      },
    })
  })

  it('creates a clean reset state for args changes and manual resets', () => {
    expect(createPaginationResetState(17)).toEqual({
      pages: [],
      globalError: null,
      paginationId: 17,
    })
  })
})
