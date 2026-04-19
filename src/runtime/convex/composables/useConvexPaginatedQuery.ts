import type { MaybeRefOrGetter } from 'vue'

import {
  useConvexPaginatedQuery as useRuntimeConvexPaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
  type PaginatedQueryStatus,
  type UseConvexPaginatedQueryData,
  type UseConvexPaginatedQueryOptions,
  type UseConvexPaginatedQueryReturn,
} from '../pagination/pagination-runtime.js'
export {
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
  type PaginatedQueryStatus,
  type UseConvexPaginatedQueryData,
  type UseConvexPaginatedQueryOptions,
  type UseConvexPaginatedQueryReturn,
}

/**
 * Paginated query composable for SSR-first Nuxt pages.
 *
 * Use this when the backend query exposes cursor-based pagination and the UI
 * should manage `loadMore()`, exhaustion state, and live refreshes through one
 * reactive surface.
 *
 * Prefer this over hand-rolled cursor state whenever the list should stay
 * aligned with Trellis' live subscription and stale-data semantics.
 *
 * @example
 * ```ts
 * const { results, loadMore, hasNextPage, status } = await useConvexPaginatedQuery(
 *   api.messages.list,
 *   { channelId },
 * )
 * ```
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
