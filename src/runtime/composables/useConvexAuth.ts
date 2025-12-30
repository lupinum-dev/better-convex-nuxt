import { useState, computed, readonly } from '#imports'

interface ConvexUser {
  id: string
  name: string
  email: string
  emailVerified?: boolean
  image?: string
  createdAt?: string
  updatedAt?: string
}

// Verbose logging helper
const log = (message: string, data?: unknown) => {
  if (import.meta.dev) {
    const env = import.meta.server ? '[SSR]' : '[Client]'
    const prefix = `[convexi:auth] ${env} `
    if (data !== undefined) {
      console.log(prefix + message, data)
    } else {
      console.log(prefix + message)
    }
  }
}

/**
 * Composable for accessing Convex authentication state.
 *
 * Returns reactive auth state that is:
 * - Pre-populated during SSR from session cookie
 * - Hydrated to client without flash of unauthenticated content
 * - Updated automatically on sign-in/sign-out
 *
 * @example
 * ```vue
 * <script setup>
 * const { user, isAuthenticated, isPending } = useConvexAuth()
 * </script>
 *
 * <template>
 *   <div v-if="isAuthenticated">Welcome, {{ user?.name }}</div>
 *   <div v-else>Please log in</div>
 * </template>
 * ```
 */
export function useConvexAuth() {
  const token = useState<string | null>('convex:token', () => null)
  const user = useState<ConvexUser | null>('convex:user', () => null)
  const isPending = useState('convex:pending', () => false)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  log('useConvexAuth called', {
    hasToken: !!token.value,
    hasUser: !!user.value,
    isAuthenticated: isAuthenticated.value,
    isPending: isPending.value,
  })

  return {
    /** The JWT token for Convex authentication (readonly) */
    token: readonly(token),
    /** The authenticated user data (readonly) */
    user: readonly(user),
    /** Whether the user is authenticated */
    isAuthenticated,
    /** Whether an auth operation is pending */
    isPending: readonly(isPending),
  }
}
