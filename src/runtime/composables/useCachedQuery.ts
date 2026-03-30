import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, type MaybeRefOrGetter, type Ref } from 'vue'

import { useNuxtData } from '#imports'

import {
  getQueryKey,
  useConvexQuery,
  type UseConvexQueryOptions,
  type UseConvexQueryReturn,
} from './useConvexQuery'

export interface UseCachedQueryOptions<
  Query extends FunctionReference<'query'>,
  SourceQuery extends FunctionReference<'query'>,
  DataT = FunctionReturnType<Query>,
> extends Omit<UseConvexQueryOptions<FunctionReturnType<Query>, DataT>, 'default'> {
  from: {
    query: SourceQuery
    args: FunctionArgs<SourceQuery>
    find: (items: FunctionReturnType<SourceQuery>) => FunctionReturnType<Query> | undefined
  }
}

export interface UseCachedQueryReturn<DataT> extends UseConvexQueryReturn<DataT> {
  isFromCache: Ref<boolean>
}

export function useCachedQuery<
  Query extends FunctionReference<'query'>,
  SourceQuery extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args: MaybeRefOrGetter<Args>,
  options: UseCachedQueryOptions<Query, SourceQuery, DataT>,
): UseCachedQueryReturn<DataT> {
  const cacheKey = getQueryKey(options.from.query, options.from.args)
  const { data: cachedSource } = useNuxtData<FunctionReturnType<SourceQuery>>(cacheKey)

  const cachedMatch = computed(() => {
    const source = cachedSource.value
    if (source === undefined || source === null) return undefined
    return options.from.find(source)
  })

  const queryResult = useConvexQuery(query, args, {
    ...options,
    default: () => {
      const match = cachedMatch.value
      return match === undefined ? undefined : (match as FunctionReturnType<Query>)
    },
  })
  const isFromCache = computed(() => {
    return queryResult.pending.value && cachedMatch.value !== undefined
  })

  return {
    ...queryResult,
    isFromCache,
  }
}
