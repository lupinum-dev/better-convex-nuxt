import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { MaybeRefOrGetter } from 'vue'

import {
  executeConvexQuery,
  useConvexQuery as useRuntimeConvexQuery,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
  type UseConvexQueryReturn,
} from '../query/query-runtime.js'
export { executeConvexQuery }

export type { UseConvexQueryData, UseConvexQueryOptions, UseConvexQueryReturn }

/**
 * Query composable for Nuxt apps using Trellis.
 *
 * Use this when a Vue component or composable needs SSR-aware data fetching
 * that hydrates into the live Convex subscription model. This is the default
 * read path for app code.
 *
 * Prefer `useConvexQuery()` over one-shot helpers when you want reactive state
 * such as `status`, `pending`, `error`, `refresh`, and `isStale`.
 *
 * Use `executeConvexQuery()` instead when you want a single request result
 * without long-lived composable state.
 *
 * @example
 * ```ts
 * const { data, status, isStale, refresh } = await useConvexQuery(api.tasks.list, {
 *   status: 'active',
 * })
 * ```
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
