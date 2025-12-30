import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'

import { useNuxtData } from '#imports'

import { getQueryKey } from '../utils/convex-cache'

/**
 * Access cached SSR data from any query without triggering a new fetch.
 *
 * Returns `undefined` if the query hasn't been executed yet. Does NOT trigger fetching.
 *
 * **Important:** This only reads from queries with `server: true` (the default).
 * Queries configured with `server: false` use a separate client-only cache
 * and will not be accessible via `useConvexData`.
 *
 * @example
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * // Access cached posts (if previously fetched with useConvexQuery)
 * const posts = useConvexData(api.posts.list)
 *
 * // Access cached post with specific args
 * const post = useConvexData(api.posts.get, { slug: 'hello' })
 *
 * // Use as initialData for instant detail page loading
 * const { data: fullPost } = useConvexQuery(
 *   api.posts.get,
 *   { slug },
 *   {
 *     initialData: () => {
 *       const cached = useConvexData(api.posts.list)
 *       return cached.value?.find(p => p.slug === slug)
 *     }
 *   }
 * )
 * </script>
 * ```
 */
export function useConvexData<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> = FunctionArgs<Query>,
>(
  query: Query,
  args?: Args,
): ReturnType<typeof useNuxtData<FunctionReturnType<Query> | undefined>>['data'] {
  const cacheKey = getQueryKey(query, args)
  // useNuxtData reads from the same cache that useAsyncData writes to
  return useNuxtData<FunctionReturnType<Query> | undefined>(cacheKey).data
}
