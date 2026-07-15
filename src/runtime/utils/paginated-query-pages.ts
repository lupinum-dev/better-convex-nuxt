import type { PaginationResult } from 'convex/server'

import { normalizeConvexError, type ConvexCallError } from '../errors'

export interface PaginationPageOpts {
  numItems: number
  cursor: string | null
  id: number
}

export interface PaginatedPageState<T> {
  paginationOpts: PaginationPageOpts
  result: PaginationResult<T> | undefined
  error: ConvexCallError | null
  pending: boolean
  unsubscribe: (() => void) | null
}

export function createPendingPaginatedPage<T>(
  paginationOpts: PaginationPageOpts,
): PaginatedPageState<T> {
  return {
    paginationOpts,
    result: undefined,
    error: null,
    pending: true,
    unsubscribe: null,
  }
}

export function commitPaginatedPageResult<T>(
  pages: PaginatedPageState<T>[],
  pageIndex: number,
  result: PaginationResult<T>,
): PaginatedPageState<T>[] {
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

export function commitPaginatedPageError<T>(
  pages: PaginatedPageState<T>[],
  pageIndex: number,
  error: unknown,
): PaginatedPageState<T>[] {
  const page = pages[pageIndex]
  if (!page) return pages

  const nextPages = [...pages]
  nextPages[pageIndex] = {
    ...page,
    // Normalize once at the page boundary so every surfaced page error is a
    // ConvexCallError .
    error: normalizeConvexError(error),
    pending: false,
  }
  return nextPages
}

export function getLastLoadedPaginatedResult<T>(
  firstPage: PaginationResult<T> | null | undefined,
  additionalPages: PaginatedPageState<T>[],
): PaginationResult<T> | undefined {
  const lastPage = additionalPages[additionalPages.length - 1]
  if (!lastPage) return firstPage ?? undefined
  if (lastPage.pending) return undefined
  return lastPage.result
}
