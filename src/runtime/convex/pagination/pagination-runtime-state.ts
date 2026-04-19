import type { PaginatedQueryResult } from '../composables/optimistic-updates.js'
import type { RuntimePageState, StablePaginationOpts } from './pagination-page-state.js'
import { createRuntimePaginationPage } from './pagination-page-state.js'
import { getNextPageInput } from './pagination-state.js'

export interface PaginationOperationContext {
  operationId: string
  meta: {
    paginated: true
    numItems: number
    cursor: string | null
    page?: number
  }
}

export interface LoadMoreBootstrapInput<T, TSubscription = unknown> {
  isSkipped: boolean
  firstPage: PaginatedQueryResult<T> | null
  pages: RuntimePageState<T, TSubscription>[]
  numItems: number
  paginationId: number
}

export interface LoadMoreBootstrapResult<T, TSubscription = unknown> {
  newPage: RuntimePageState<T, TSubscription>
  pageIndex: number
}

export function createStablePaginatedSubscriptionKey(input: {
  isSkipped: boolean
  firstPageCacheKey: string
  queryKey: string
}): string {
  if (input.isSkipped) {
    return `paginated:${input.firstPageCacheKey}:idle`
  }
  return `paginated:${input.queryKey}`
}

export function createPaginationOperationContext(
  paginationOpts: StablePaginationOpts,
  operationId: string,
  pageIndex?: number,
): PaginationOperationContext {
  return {
    operationId,
    meta: {
      paginated: true,
      numItems: paginationOpts.numItems,
      cursor: paginationOpts.cursor,
      ...(pageIndex === undefined ? {} : { page: pageIndex + 2 }),
    },
  }
}

export function createLoadMoreBootstrap<T, TSubscription = unknown>(
  input: LoadMoreBootstrapInput<T, TSubscription>,
): LoadMoreBootstrapResult<T, TSubscription> | null {
  if (input.isSkipped) return null

  const lastLoadedPage = getNextPageInput({
    firstPage: input.firstPage,
    extraPages: input.pages,
  })
  const pendingLastPage =
    input.pages.length > 0 ? input.pages[input.pages.length - 1]?.pending === true : false

  if (!lastLoadedPage || pendingLastPage || lastLoadedPage.isDone) {
    return null
  }

  return {
    pageIndex: input.pages.length,
    newPage: createRuntimePaginationPage<T, TSubscription>({
      numItems: input.numItems,
      cursor: lastLoadedPage.continueCursor,
      id: input.paginationId,
    }),
  }
}

export function createPaginationResetState(nextPaginationId: number): {
  pages: []
  globalError: null
  paginationId: number
} {
  return {
    pages: [],
    globalError: null,
    paginationId: nextPaginationId,
  }
}
