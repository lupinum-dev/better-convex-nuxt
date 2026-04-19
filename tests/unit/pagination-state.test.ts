import { describe, expect, it } from 'vitest'

import {
  collectPaginatedResults,
  derivePaginatedStatus,
  getNextPageInput,
  shouldPaginatedResultsBeStale,
  shouldUsePreviousPaginatedResults,
} from '../../src/runtime/convex/pagination/pagination-state'

describe('pagination-state (unit)', () => {
  it('derives ready, loading-more, exhausted, and error states from page snapshots', () => {
    const firstPage = { page: ['a'], isDone: false, continueCursor: 'c1' }

    expect(
      derivePaginatedStatus({
        isSkipped: false,
        isManualRefreshPending: false,
        firstPage,
        firstPagePending: false,
        firstPageError: null,
        extraPages: [],
        globalError: null,
        serverEnabled: true,
        isServerRuntime: false,
      }),
    ).toBe('ready')

    expect(
      derivePaginatedStatus({
        isSkipped: false,
        isManualRefreshPending: false,
        firstPage,
        firstPagePending: false,
        firstPageError: null,
        extraPages: [{ result: null, error: null, pending: true }],
        globalError: null,
        serverEnabled: true,
        isServerRuntime: false,
      }),
    ).toBe('loading-more')

    expect(
      derivePaginatedStatus({
        isSkipped: false,
        isManualRefreshPending: false,
        firstPage: { ...firstPage, isDone: true },
        firstPagePending: false,
        firstPageError: null,
        extraPages: [],
        globalError: null,
        serverEnabled: true,
        isServerRuntime: false,
      }),
    ).toBe('exhausted')

    expect(
      derivePaginatedStatus({
        isSkipped: false,
        isManualRefreshPending: false,
        firstPage,
        firstPagePending: false,
        firstPageError: null,
        extraPages: [{ result: null, error: new Error('boom'), pending: false }],
        globalError: null,
        serverEnabled: true,
        isServerRuntime: false,
      }),
    ).toBe('error')
  })

  it('collects paginated results and picks the correct next page cursor source', () => {
    const firstPage = { page: ['a', 'b'], isDone: false, continueCursor: 'c1' }
    const secondPage = { page: ['c'], isDone: false, continueCursor: 'c2' }

    expect(
      collectPaginatedResults(firstPage, [{ result: secondPage, error: null, pending: false }]),
    ).toEqual(['a', 'b', 'c'])

    expect(getNextPageInput({ firstPage, extraPages: [] })).toEqual(firstPage)
    expect(
      getNextPageInput({
        firstPage,
        extraPages: [{ result: secondPage, error: null, pending: false }],
      }),
    ).toEqual(secondPage)
  })

  it('decides when previous paginated results should be reused and marked stale', () => {
    expect(
      shouldUsePreviousPaginatedResults({
        keepPreviousData: true,
        status: 'loading-first-page',
        transformedResults: [],
        lastSettledResults: ['cached'],
      }),
    ).toBe(true)

    expect(
      shouldPaginatedResultsBeStale({
        keepPreviousData: true,
        isSkipped: false,
        status: 'loading-first-page',
        error: null,
        lastSettledArgsHash: 'old',
        currentArgsHash: 'new',
        results: ['cached'],
      }),
    ).toBe(true)

    expect(
      shouldPaginatedResultsBeStale({
        keepPreviousData: true,
        isSkipped: false,
        status: 'ready',
        error: null,
        lastSettledArgsHash: 'old',
        currentArgsHash: 'new',
        results: ['cached'],
      }),
    ).toBe(false)
  })
})
