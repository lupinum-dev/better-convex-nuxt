import type { PaginatedQueryResult } from '../composables/optimistic-updates.js'

export type PaginatedQueryStatus =
  | 'skipped'
  | 'loading-first-page'
  | 'ready'
  | 'loading-more'
  | 'exhausted'
  | 'error'

export interface PaginationStatePage<T> {
  result: PaginatedQueryResult<T> | null
  error: Error | null
  pending: boolean
}

export interface DerivePaginatedStatusInput<T> {
  isSkipped: boolean
  isManualRefreshPending: boolean
  firstPage: PaginatedQueryResult<T> | null
  firstPagePending: boolean
  firstPageError: Error | null
  extraPages: PaginationStatePage<T>[]
  globalError: Error | null
  serverEnabled: boolean
  isServerRuntime: boolean
}

export interface UsePreviousPaginatedResultsInput<T> {
  keepPreviousData: boolean
  status: PaginatedQueryStatus
  transformedResults: T[]
  lastSettledResults: T[] | null
}

export interface PaginatedStaleInput<T> {
  keepPreviousData: boolean
  isSkipped: boolean
  status: PaginatedQueryStatus
  error: Error | null
  lastSettledArgsHash: string | null
  currentArgsHash: string
  results: T[]
}

export interface NextPageInput<T> {
  firstPage: PaginatedQueryResult<T> | null
  extraPages: PaginationStatePage<T>[]
}

export function derivePaginatedStatus<T>(
  input: DerivePaginatedStatusInput<T>,
): PaginatedQueryStatus {
  if (input.isSkipped) return 'skipped'
  if (input.isManualRefreshPending) return 'loading-first-page'

  const extraPageError = input.extraPages.some((page) => page.error != null)
  if (input.globalError || input.firstPageError || extraPageError) {
    return 'error'
  }

  if (!input.serverEnabled && input.isServerRuntime) {
    return 'loading-first-page'
  }

  if (!input.firstPage || input.firstPagePending) {
    return 'loading-first-page'
  }

  if (input.extraPages.some((page) => page.pending)) {
    return 'loading-more'
  }

  const lastPage =
    input.extraPages.length > 0 ? input.extraPages[input.extraPages.length - 1] : null
  if (lastPage?.result?.isDone || input.firstPage.isDone) {
    return 'exhausted'
  }

  return 'ready'
}

export function collectPaginatedResults<T>(
  firstPage: PaginatedQueryResult<T> | null,
  extraPages: PaginationStatePage<T>[],
): T[] {
  const items: T[] = []

  if (firstPage) {
    items.push(...firstPage.page)
  }

  for (const page of extraPages) {
    if (page.result) {
      items.push(...page.result.page)
    }
  }

  return items
}

export function shouldUsePreviousPaginatedResults<T>(
  input: UsePreviousPaginatedResultsInput<T>,
): boolean {
  if (!input.keepPreviousData) return false
  if (input.status !== 'loading-first-page') return false
  if (input.transformedResults.length > 0) return false
  return Boolean(input.lastSettledResults && input.lastSettledResults.length > 0)
}

export function shouldPaginatedResultsBeStale<T>(input: PaginatedStaleInput<T>): boolean {
  if (!input.keepPreviousData) return false
  if (input.isSkipped || input.status !== 'loading-first-page') return false
  if (input.error) return false
  if (input.lastSettledArgsHash === null || input.lastSettledArgsHash === input.currentArgsHash) {
    return false
  }
  return input.results.length > 0
}

export function getNextPageInput<T>(input: NextPageInput<T>): PaginatedQueryResult<T> | null {
  const lastExtraPage =
    input.extraPages.length > 0 ? input.extraPages[input.extraPages.length - 1] : null
  return lastExtraPage?.result ?? input.firstPage
}
