import type { PaginationResult } from 'convex/server'

import { normalizeConvexError, type ConvexCallError } from '../errors'

/** Cache-busting generation; random avoids SSR-global sequential state. */
export function createPaginationGeneration(): number {
  return Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1)) + 1
}

export interface PaginationPageOptions {
  numItems: number
  cursor: string | null
  id: number
}

export interface PaginationPageState<T> {
  paginationOpts: PaginationPageOptions
  result: PaginationResult<T> | undefined
  error: ConvexCallError | null
  pending: boolean
  unsubscribe: (() => void) | null
}

export function createPendingPaginationPage<T>(
  paginationOpts: PaginationPageOptions,
): PaginationPageState<T> {
  return {
    paginationOpts,
    result: undefined,
    error: null,
    pending: true,
    unsubscribe: null,
  }
}

export function commitPaginationPageResult<T>(
  pages: PaginationPageState<T>[],
  pageIndex: number,
  result: PaginationResult<T>,
): PaginationPageState<T>[] {
  const page = pages[pageIndex]
  if (!page) return pages

  const nextPages = [...pages]
  nextPages[pageIndex] = {
    ...page,
    result,
    error: null,
    pending: false,
  }
  return nextPages
}

export function commitPaginationPageError<T>(
  pages: PaginationPageState<T>[],
  pageIndex: number,
  error: unknown,
): PaginationPageState<T>[] {
  const page = pages[pageIndex]
  if (!page) return pages

  const nextPages = [...pages]
  nextPages[pageIndex] = {
    ...page,
    error: normalizeConvexError(error),
    pending: false,
  }
  return nextPages
}

export function getLastLoadedPaginationResult<T>(
  firstPage: PaginationResult<T> | null | undefined,
  additionalPages: PaginationPageState<T>[],
): PaginationResult<T> | undefined {
  const lastPage = additionalPages[additionalPages.length - 1]
  if (!lastPage) return firstPage ?? undefined
  if (lastPage.pending) return undefined
  return lastPage.result
}

export type PaginationStatus =
  | 'idle'
  | 'loading-first-page'
  | 'ready'
  | 'loading-more'
  | 'exhausted'
  | 'error'

export type PaginationFirstPageState = { state: 'loading' } | { state: 'ready'; isDone: boolean }

export type PaginationNextPageState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'exhausted' }

export interface PaginationStatusState {
  disabled: boolean
  refresh: 'idle' | 'pending'
  hasError: boolean
  firstPage: PaginationFirstPageState
  nextPage: PaginationNextPageState
}

export function computePaginationStatus(input: PaginationStatusState): PaginationStatus {
  if (input.disabled) return 'idle'
  if (input.refresh === 'pending') return 'loading-first-page'
  if (input.hasError) return 'error'
  if (input.firstPage.state === 'loading') return 'loading-first-page'
  if (input.nextPage.state === 'loading') return 'loading-more'
  if (input.nextPage.state === 'exhausted' || input.firstPage.isDone) return 'exhausted'
  return 'ready'
}

export interface PaginationStaleInput {
  keepPreviousData: boolean
  status: PaginationStatus
  transformedResultCount: number
  lastSettledResultCount: number
}

export function computePaginationStale(input: PaginationStaleInput): boolean {
  return (
    input.keepPreviousData &&
    input.status === 'loading-first-page' &&
    input.transformedResultCount === 0 &&
    input.lastSettledResultCount > 0
  )
}
