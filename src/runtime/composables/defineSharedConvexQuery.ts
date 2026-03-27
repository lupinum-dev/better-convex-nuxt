import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { MaybeRefOrGetter } from 'vue'

import { getFunctionName } from '../utils/convex-cache'
import {
  useConvexQuery,
  type UseConvexQueryOptions,
  type UseConvexQueryReturn,
} from './useConvexQuery'

let hasWarnedDefineSharedConvexQuery = false

export interface DefineSharedConvexQueryOptions<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
> {
  /** Stable app-level key used to share a single query state instance. */
  key?: string
  /** Convex query reference. */
  query: Query
  /** Query args (supports refs/getters, including nullable disable semantics). */
  args?: MaybeRefOrGetter<Args>
  /** Same options as useConvexQuery. */
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>
}

/**
 * @deprecated Prefer `useConvexQuery(query, args, { shared: 'key' })`.
 */
export function defineSharedConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(config: DefineSharedConvexQueryOptions<Query, Args, DataT>): () => UseConvexQueryReturn<DataT> {
  return () => {
    if (import.meta.dev && !hasWarnedDefineSharedConvexQuery) {
      hasWarnedDefineSharedConvexQuery = true
      console.warn(
        "[better-convex-nuxt] `defineSharedConvexQuery` is deprecated. Prefer `useConvexQuery(query, args, { shared: 'key' })`.",
      )
    }

    return useConvexQuery(config.query, config.args, {
      ...config.options,
      shared: config.key ?? `convex:shared:${getFunctionName(config.query)}`,
    })
  }
}
