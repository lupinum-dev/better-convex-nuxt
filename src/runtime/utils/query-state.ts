export type PaginatedQueryStatus =
  | 'idle'
  | 'loading-first-page'
  | 'ready'
  | 'loading-more'
  | 'exhausted'
  | 'error'

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

export interface ConvexQueryStaleInput {
  keepPreviousData: boolean
  isSkipped: boolean
  hasLastSettledData: boolean
  hasLastSettledArgsHash: boolean
  pending: boolean
  argsHash: string
  lastSettledArgsHash: string | null
}

export function computeConvexQueryStale(input: ConvexQueryStaleInput): boolean {
  if (!input.keepPreviousData || input.isSkipped) return false
  if (!input.hasLastSettledData || !input.hasLastSettledArgsHash) return false
  return input.pending && input.argsHash !== input.lastSettledArgsHash
}

export interface PaginatedQueryStatusInput {
  isSkipped: boolean
  isManualRefreshPending: boolean
  hasGlobalError: boolean
  hasFirstPageError: boolean
  hasMorePageError: boolean
  server: boolean
  isServer: boolean
  isClient: boolean
  resolveImmediately: boolean
  hasFirstPageData: boolean
  firstPagePending: boolean
  lastPagePending: boolean
  lastPageDone: boolean
  firstPageDone: boolean
}

export function computePaginatedQueryStatus(
  input: PaginatedQueryStatusInput,
): PaginatedQueryStatus {
  if (input.isSkipped) return 'idle'

  if (input.isManualRefreshPending) {
    return 'loading-first-page'
  }

  if (input.hasGlobalError || input.hasFirstPageError || input.hasMorePageError) {
    return 'error'
  }

  if (!input.server && input.isServer) {
    return 'loading-first-page'
  }

  if (!input.hasFirstPageData && (!input.server || input.resolveImmediately) && input.isClient) {
    return 'loading-first-page'
  }

  if (input.firstPagePending && !input.hasFirstPageData) {
    return 'loading-first-page'
  }

  if (!input.hasFirstPageData) {
    return 'loading-first-page'
  }

  if (input.lastPagePending) {
    return 'loading-more'
  }

  if (input.lastPageDone || input.firstPageDone) {
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
