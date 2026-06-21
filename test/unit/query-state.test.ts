import { describe, expect, it } from 'vitest'

import {
  computeConvexQueryPending,
  computeConvexQueryStale,
  computePaginatedQueryStale,
  computePaginatedQueryStatus,
  type PaginatedQueryStatusInput,
} from '../../src/runtime/utils/query-state'

const basePaginatedInput: PaginatedQueryStatusInput = {
  isSkipped: false,
  isManualRefreshPending: false,
  hasGlobalError: false,
  hasFirstPageError: false,
  hasMorePageError: false,
  server: true,
  isServer: false,
  isClient: true,
  resolveImmediately: false,
  hasFirstPageData: true,
  firstPagePending: false,
  lastPagePending: false,
  lastPageDone: false,
  firstPageDone: false,
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

  describe('computeConvexQueryStale', () => {
    it('requires previous data, previous args, pending state, and changed args', () => {
      expect(
        computeConvexQueryStale({
          keepPreviousData: true,
          isSkipped: false,
          hasLastSettledData: true,
          hasLastSettledArgsHash: true,
          pending: true,
          argsHash: 'next',
          lastSettledArgsHash: 'previous',
        }),
      ).toBe(true)
    })

    it('is false without keepPreviousData or while skipped', () => {
      expect(
        computeConvexQueryStale({
          keepPreviousData: false,
          isSkipped: false,
          hasLastSettledData: true,
          hasLastSettledArgsHash: true,
          pending: true,
          argsHash: 'next',
          lastSettledArgsHash: 'previous',
        }),
      ).toBe(false)

      expect(
        computeConvexQueryStale({
          keepPreviousData: true,
          isSkipped: true,
          hasLastSettledData: true,
          hasLastSettledArgsHash: true,
          pending: true,
          argsHash: 'next',
          lastSettledArgsHash: 'previous',
        }),
      ).toBe(false)
    })
  })

  describe('computePaginatedQueryStatus', () => {
    it('returns idle when skipped', () => {
      expect(computePaginatedQueryStatus({ ...basePaginatedInput, isSkipped: true })).toBe('idle')
    })

    it('prioritizes manual refresh loading before existing data state', () => {
      expect(
        computePaginatedQueryStatus({
          ...basePaginatedInput,
          isManualRefreshPending: true,
          hasFirstPageData: true,
        }),
      ).toBe('loading-first-page')
    })

    it('returns error for global, first-page, or later-page errors', () => {
      expect(computePaginatedQueryStatus({ ...basePaginatedInput, hasGlobalError: true })).toBe(
        'error',
      )
      expect(computePaginatedQueryStatus({ ...basePaginatedInput, hasFirstPageError: true })).toBe(
        'error',
      )
      expect(computePaginatedQueryStatus({ ...basePaginatedInput, hasMorePageError: true })).toBe(
        'error',
      )
    })

    it('reports first-page loading for SSR-disabled server render and immediate client loads', () => {
      expect(
        computePaginatedQueryStatus({
          ...basePaginatedInput,
          server: false,
          isServer: true,
          isClient: false,
          hasFirstPageData: false,
        }),
      ).toBe('loading-first-page')

      expect(
        computePaginatedQueryStatus({
          ...basePaginatedInput,
          resolveImmediately: true,
          hasFirstPageData: false,
        }),
      ).toBe('loading-first-page')
    })

    it('distinguishes ready, loading-more, and exhausted', () => {
      expect(computePaginatedQueryStatus(basePaginatedInput)).toBe('ready')
      expect(computePaginatedQueryStatus({ ...basePaginatedInput, lastPagePending: true })).toBe(
        'loading-more',
      )
      expect(computePaginatedQueryStatus({ ...basePaginatedInput, lastPageDone: true })).toBe(
        'exhausted',
      )
      expect(computePaginatedQueryStatus({ ...basePaginatedInput, firstPageDone: true })).toBe(
        'exhausted',
      )
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
