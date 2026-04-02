import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { MaybeRefOrGetter } from 'vue'

import {
  createConvexQueryState,
  executeConvexQuery,
  executeQueryHttp,
  executeQueryViaSubscription,
  getQueryKey,
  useConvexQuery as useRuntimeConvexQuery,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
  type UseConvexQueryReturn,
} from './internal/query-runtime'

export {
  createConvexQueryState,
  executeConvexQuery,
  executeQueryHttp,
  executeQueryViaSubscription,
  getQueryKey,
}

export type { UseConvexQueryData, UseConvexQueryOptions, UseConvexQueryReturn }

/**
 * Thin public wrapper over the shared query runtime.
 */
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<FunctionArgs<Query> | null | undefined>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): UseConvexQueryReturn<DataT> {
  return useRuntimeConvexQuery(query, args, options)
}
