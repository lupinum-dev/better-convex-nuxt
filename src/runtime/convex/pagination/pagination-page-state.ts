import type { PaginatedQueryResult } from '../composables/optimistic-updates.js'

export interface StablePaginationOpts {
  numItems: number
  cursor: string | null
}

export interface RuntimePaginationOpts extends StablePaginationOpts {
  id: number
}

export interface RuntimePageState<T, TSubscription = unknown> {
  paginationOpts: RuntimePaginationOpts
  result: PaginatedQueryResult<T> | null
  error: Error | null
  pending: boolean
  subscription: TSubscription | null
}

export function createSkippedPaginatedCacheKey(functionName: string): string {
  return `convex-paginated:skipped:${functionName}`
}

export function createPaginatedWatchSource(
  argsHash: string,
  isSkipped: boolean,
  paginationId: number,
): string {
  return `${argsHash}:${isSkipped ? 'skipped' : 'enabled'}:${paginationId}`
}

export function createRuntimePaginationPage<T, TSubscription = unknown>(
  input: RuntimePaginationOpts,
): RuntimePageState<T, TSubscription> {
  return {
    paginationOpts: input,
    result: null,
    error: null,
    pending: true,
    subscription: null,
  }
}

export function updateRuntimePaginationPage<T, TSubscription = unknown>(
  pages: RuntimePageState<T, TSubscription>[],
  pageIndex: number,
  updater: (page: RuntimePageState<T, TSubscription>) => RuntimePageState<T, TSubscription>,
): RuntimePageState<T, TSubscription>[] {
  const current = pages[pageIndex]
  if (!current) return pages
  const nextPages = [...pages]
  nextPages[pageIndex] = updater(current)
  return nextPages
}

export function markRuntimePaginationPagesRefreshing<T, TSubscription = unknown>(
  pages: RuntimePageState<T, TSubscription>[],
): RuntimePageState<T, TSubscription>[] {
  return pages.map((page) => ({
    ...page,
    pending: true,
    error: null,
  }))
}

export function resolveRuntimePaginationError<T, TSubscription = unknown>(
  globalError: Error | null,
  firstPageError: Error | null,
  pages: RuntimePageState<T, TSubscription>[],
): Error | null {
  if (globalError) return globalError
  if (firstPageError) return firstPageError
  for (const page of pages) {
    if (page.error) return page.error
  }
  return null
}

export function shouldPersistSettledPaginatedResults(isSkipped: boolean, status: string): boolean {
  return !isSkipped && status !== 'loading-first-page'
}
