import type { ConvexClient } from 'convex/browser'

import { useNuxtApp } from '#imports'

/**
 * Composable for accessing the Convex client instance.
 *
 * Returns the singleton ConvexClient that is:
 * - Configured with auth token from SSR
 * - Ready to use for queries, mutations, and actions
 *
 * Throws when ConvexClient is unavailable (for example during SSR or if the
 * module is not configured with a Convex URL).
 *
 * @example
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const convex = useConvex()
 *
 * // For client-only usage
 * onMounted(async () => {
 *   const result = await convex.query(api.tasks.list)
 * })
 * </script>
 * ```
 */
export function useConvex(): ConvexClient {
  const nuxtApp = useNuxtApp()
  const convex = nuxtApp.$convex as ConvexClient | undefined

  if (!convex) {
    throw new Error(
      '[useConvex] Convex client is unavailable. This composable is client-only and requires a configured Convex URL.',
    )
  }

  return convex
}
