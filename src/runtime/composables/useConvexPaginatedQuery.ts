import type { MaybeRefOrGetter } from 'vue'

import {
  createConvexPaginatedQueryState,
  useConvexPaginatedQuery as useRuntimeConvexPaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
  type PaginatedQueryStatus,
  type UseConvexPaginatedQueryData,
  type UseConvexPaginatedQueryOptions,
  type UseConvexPaginatedQueryReturn,
} from './internal/pagination-runtime'

export {
  createConvexPaginatedQueryState,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
  type PaginatedQueryStatus,
  type UseConvexPaginatedQueryData,
  type UseConvexPaginatedQueryOptions,
  type UseConvexPaginatedQueryReturn,
}

/**
 * Thin public wrapper over the shared pagination runtime.
 */
export function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<PaginatedQueryArgs<Query> | null | undefined>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
): UseConvexPaginatedQueryReturn<TransformedItem> {
  return useRuntimeConvexPaginatedQuery(query, args, options)
}
