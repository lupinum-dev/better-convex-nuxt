import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import { useNuxtData } from '#imports'

import { getFunctionName, getQueryKey } from '../shared/convex-cache.js'
import {
  useConvexQuery,
  type UseConvexQueryOptions,
  type UseConvexQueryReturn,
} from './useConvexQuery.js'

export type CachedQuerySeedStatus = 'matched' | 'match-missing' | 'source-missing'

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
  cacheStatus: Ref<CachedQuerySeedStatus>
}

/**
 * Query composable that seeds initial data from an already-loaded list query.
 *
 * Use this on detail pages to avoid a loading flash when navigating from a list.
 * The cached list data is used as the default value while the detail query loads,
 * then replaced by the real result once it arrives.
 *
 * `isFromCache` is `true` while showing cached data, `false` once the real query resolves.
 *
 * @example List-to-detail navigation
 * ```vue
 * <script setup>
 * import { api } from '#trellis/api'
 *
 * const props = defineProps<{ id: string }>()
 *
 * const { data: post, isFromCache } = await useCachedQuery(
 *   api.posts.get,
 *   () => ({ id: props.id }),
 *   {
 *     from: {
 *       query: api.posts.list,
 *       args: {},
 *       find: (posts) => posts.find(p => p._id === props.id),
 *     },
 *   },
 * )
 * </script>
 * ```
 */
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
  const queryName = getFunctionName(query)
  const sourceQueryName = getFunctionName(options.from.query)

  const cachedMatch = computed(() => {
    const source = cachedSource.value
    if (source === undefined || source === null) return undefined
    return options.from.find(source)
  })

  const cacheStatus = computed<CachedQuerySeedStatus>(() => {
    const source = cachedSource.value
    if (source === undefined || source === null) return 'source-missing'
    return cachedMatch.value === undefined ? 'match-missing' : 'matched'
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

  let warnedMatchKey: string | null = null

  watch(
    cacheStatus,
    (status) => {
      if (status !== 'match-missing') return
      const warningKey = `${sourceQueryName}->${queryName}:${cacheKey}`
      if (warningKey === warnedMatchKey) return
      warnedMatchKey = warningKey
      console.warn(
        [
          `[trellis] useCachedQuery() found cached source data for "${sourceQueryName}" but no cached match for "${queryName}".`,
          'This usually means `from.args` or `from.find(...)` no longer matches the list data that populated the page.',
          'The query will still run normally without a seed.',
        ].join(' '),
        {
          query: queryName,
          sourceQuery: sourceQueryName,
          sourceArgs: options.from.args,
        },
      )
    },
    { immediate: true },
  )

  return {
    ...queryResult,
    isFromCache,
    cacheStatus,
  }
}
