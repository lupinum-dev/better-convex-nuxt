export type PaginatedQueryStatus =
  | 'idle'
  | 'loading-first-page'
  | 'ready'
  | 'loading-more'
  | 'exhausted'
  | 'error'

export type PaginatedFirstPageState = { state: 'loading' } | { state: 'ready'; isDone: boolean }

export type PaginatedNextPageState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'exhausted' }

export interface ConvexQueryPendingInput {
  isSkipped: boolean
  hasData: boolean
  hasSettled: boolean
  server: boolean
  resolveImmediately: boolean
  isServer: boolean
  isClient: boolean
  asyncDataPending: boolean
  isAuthPending?: boolean
}

export function computeConvexQueryPending(input: ConvexQueryPendingInput): boolean {
  if (input.isSkipped) return false
  if (input.isAuthPending) return true

  if (!input.server) {
    if (input.isServer) return true
    if (input.isClient && !input.hasData && !input.hasSettled) return true
  }

  if (input.resolveImmediately && input.isClient && !input.hasData && !input.hasSettled) {
    return true
  }

  return input.asyncDataPending
}

export interface PaginatedQueryStatusState {
  disabled: boolean
  refresh: 'idle' | 'pending'
  hasError: boolean
  firstPage: PaginatedFirstPageState
  nextPage: PaginatedNextPageState
}

export function computePaginatedQueryStatus(
  input: PaginatedQueryStatusState,
): PaginatedQueryStatus {
  if (input.disabled) return 'idle'

  if (input.refresh === 'pending') {
    return 'loading-first-page'
  }

  if (input.hasError) {
    return 'error'
  }

  if (input.firstPage.state === 'loading') {
    return 'loading-first-page'
  }

  if (input.nextPage.state === 'loading') {
    return 'loading-more'
  }

  if (input.nextPage.state === 'exhausted' || input.firstPage.isDone) {
    return 'exhausted'
  }

  return 'ready'
}

export interface PaginatedQueryStaleInput {
  keepPreviousData: boolean
  status: PaginatedQueryStatus
  transformedResultCount: number
  lastSettledResultCount: number
}

export function computePaginatedQueryStale(input: PaginatedQueryStaleInput): boolean {
  return (
    input.keepPreviousData &&
    input.status === 'loading-first-page' &&
    input.transformedResultCount === 0 &&
    input.lastSettledResultCount > 0
  )
}
