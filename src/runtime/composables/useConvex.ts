import type { ConvexClient } from 'convex/browser'

import { useNuxtApp } from '#imports'

/**
 * Composable for accessing the Convex client instance.
 *
 * Returns the singleton ConvexClient that is:
 * - Configured with auth token from SSR
 * - Ready to use for queries, mutations, and actions
 *
 * Note: Returns null during SSR as ConvexClient only works on the client.
 * Use this composable in client-only code or check for null.
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
 *   if (convex) {
 *     const result = await convex.query(api.tasks.list)
 *   }
 * })
 * </script>
 * ```
 */
export function useConvex(): ConvexClient | null {
  const nuxtApp = useNuxtApp()
  const convex = nuxtApp.$convex as ConvexClient | undefined

  // Return null during SSR - ConvexClient only works on client
  return convex ?? null
}
