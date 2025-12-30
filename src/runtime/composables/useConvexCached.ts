import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'

import { useState } from '#imports'

import { getQueryKey } from '../utils/convex-cache'

/**
 * Synchronously read cached data from a previous useConvexQuery call.
 *
 * This is useful for providing initial data when navigating between pages,
 * enabling instant navigation with cached data while the full query loads.
 *
 * Returns undefined if the query hasn't been executed yet (e.g., direct navigation
 * to a detail page without visiting the list page first).
 *
 * @example
 * ```ts
 * // On a detail page, reuse cached data from a list page for instant display
 * const { data } = await useConvexQuery(
 *   api.posts.getBySlug,
 *   { slug },
 *   {
 *     lazy: true,
 *     default: () => {
 *       // Get cached posts from list query
 *       const cached = useConvexCached(api.posts.list, {})
 *       return cached?.find(p => p.slug === slug)
 *     }
 *   }
 * )
 * ```
 *
 * @param query - The Convex query function reference
 * @param args - The arguments that were passed to the query (must match exactly)
 * @returns The cached data if available, undefined otherwise
 */
export function useConvexCached<Query extends FunctionReference<'query'>>(
  query: Query,
  args?: FunctionArgs<Query>,
): FunctionReturnType<Query> | undefined {
  const cacheKey = getQueryKey(query, args ?? {})
  const cached = useState<FunctionReturnType<Query> | undefined>(cacheKey)
  return cached.value
}
