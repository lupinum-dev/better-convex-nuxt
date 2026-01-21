import { useState, computed, readonly } from '#imports'

import type { ConvexUser } from '../utils/types'

// Re-export for convenience
export type { ConvexUser } from '../utils/types'

/**
 * Composable for accessing Convex authentication state.
 *
 * Returns reactive auth state that is:
 * - Pre-populated during SSR from session cookie
 * - Hydrated to client without flash of unauthenticated content
 * - Updated automatically on sign-in/sign-out
 *
 * Note: This composable is only available when `auth: true` is set in your config.
 *
 * @example
 * ```vue
 * <script setup>
 * const { user, isAuthenticated, isPending, authReady } = useConvexAuth()
 * </script>
 *
 * <template>
 *   <div v-if="!authReady || isPending">Loading...</div>
 *   <div v-else-if="isAuthenticated">Welcome, {{ user?.name }}</div>
 *   <div v-else>Please log in</div>
 * </template>
 * ```
 */
export function useConvexAuth() {
  const token = useState<string | null>('convex:token', () => null)
  const user = useState<ConvexUser | null>('convex:user', () => null)
  const pending = useState<boolean>('convex:pending', () => false)
  const authError = useState<string | null>('convex:authError', () => null)
  const authReady = useState<boolean>('convex:authReady', () => false)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  return {
    /** The JWT token for Convex authentication (readonly) */
    token: readonly(token),
    /** The authenticated user data (readonly) */
    user: readonly(user),
    /** Whether the user is authenticated */
    isAuthenticated,
    /** Whether an auth operation is pending */
    isPending: readonly(pending),
    /** Auth error message if authentication failed (e.g., 401/403) */
    authError: readonly(authError),
    /** Whether the initial auth check completed */
    authReady: readonly(authReady),
  }
}
