import { describe, expect, it } from 'vitest'

import {
  computeConvexQueryPending,
  computePaginatedQueryStale,
  computePaginatedQueryStatus,
  type PaginatedQueryStatusState,
} from '../../src/runtime/utils/query-state'

const readyPaginatedState: PaginatedQueryStatusState = {
  disabled: false,
  refresh: 'idle',
  hasError: false,
  firstPage: { state: 'ready', isDone: false },
  nextPage: { state: 'idle' },
}

describe('query state helpers', () => {
  describe('computeConvexQueryPending', () => {
    it('is never pending when skipped', () => {
      expect(
        computeConvexQueryPending({
          isSkipped: true,
          hasData: false,
          hasSettled: false,
          server: false,
          resolveImmediately: true,
          isServer: true,
          isClient: false,
          asyncDataPending: true,
        }),
      ).toBe(false)
    })

    it('stays pending on the server when server fetching is disabled', () => {
      expect(
        computeConvexQueryPending({
          isSkipped: false,
          hasData: false,
          hasSettled: false,
          server: false,
          resolveImmediately: false,
          isServer: true,
          isClient: false,
          asyncDataPending: false,
        }),
      ).toBe(true)
    })

    it('stays pending for immediate client consumers until data settles', () => {
      expect(
        computeConvexQueryPending({
          isSkipped: false,
          hasData: false,
          hasSettled: false,
          server: true,
          resolveImmediately: true,
          isServer: false,
          isClient: true,
          asyncDataPending: false,
        }),
      ).toBe(true)
    })

    it('falls back to Nuxt async data pending after data exists', () => {
      expect(
        computeConvexQueryPending({
          isSkipped: false,
          hasData: true,
          hasSettled: true,
          server: true,
          resolveImmediately: true,
          isServer: false,
          isClient: true,
          asyncDataPending: false,
        }),
      ).toBe(false)
    })
  })

  describe('computePaginatedQueryStatus', () => {
    it('returns idle when skipped', () => {
      expect(computePaginatedQueryStatus({ ...readyPaginatedState, disabled: true })).toBe('idle')
    })

    it('prioritizes manual refresh loading before existing data state', () => {
      expect(
        computePaginatedQueryStatus({
          ...readyPaginatedState,
          refresh: 'pending',
        }),
      ).toBe('loading-first-page')
    })

    it('returns error for any query error', () => {
      expect(computePaginatedQueryStatus({ ...readyPaginatedState, hasError: true })).toBe('error')
    })

    it('reports first-page loading until the first page is ready', () => {
      expect(
        computePaginatedQueryStatus({
          ...readyPaginatedState,
          firstPage: { state: 'loading' },
        }),
      ).toBe('loading-first-page')
    })

    it('distinguishes ready, loading-more, and exhausted', () => {
      expect(computePaginatedQueryStatus(readyPaginatedState)).toBe('ready')
      expect(
        computePaginatedQueryStatus({ ...readyPaginatedState, nextPage: { state: 'loading' } }),
      ).toBe('loading-more')
      expect(
        computePaginatedQueryStatus({ ...readyPaginatedState, nextPage: { state: 'exhausted' } }),
      ).toBe('exhausted')
      expect(
        computePaginatedQueryStatus({
          ...readyPaginatedState,
          firstPage: { state: 'ready', isDone: true },
        }),
      ).toBe('exhausted')
    })

    it('keeps a first-page-only exhausted result out of loading-more', () => {
      expect(
        computePaginatedQueryStatus({
          ...readyPaginatedState,
          firstPage: { state: 'ready', isDone: true },
          nextPage: { state: 'loading' },
        }),
      ).toBe('loading-more')
    })
  })

  describe('computePaginatedQueryStale', () => {
    it('is stale only when previous rows are shown during first-page reload', () => {
      expect(
        computePaginatedQueryStale({
          keepPreviousData: true,
          status: 'loading-first-page',
          transformedResultCount: 0,
          lastSettledResultCount: 3,
        }),
      ).toBe(true)

      expect(
        computePaginatedQueryStale({
          keepPreviousData: true,
          status: 'loading-more',
          transformedResultCount: 0,
          lastSettledResultCount: 3,
        }),
      ).toBe(false)
    })
  })
})
