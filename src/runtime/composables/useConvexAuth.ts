import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'
import { readonly } from '#imports'
import type { ConvexUser } from '../utils/types'
import { useConvexAuthController } from './internal/useConvexAuthController'

// Re-export for convenience
export type { ConvexUser } from '../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

export interface UseConvexAuthReturn {
  /** The authenticated user data (readonly) */
  user: Readonly<Ref<ConvexUser | null>>
  /** Whether the user is currently authenticated */
  isAuthenticated: ComputedRef<boolean>
  /** Whether auth is still initializing (true on client until first token fetch resolves) */
  isPending: Readonly<Ref<boolean>>
  /** True when not authenticated and not pending (reads better in templates than `!isAuthenticated`) */
  isAnonymous: ComputedRef<boolean>
  /** True when the user was previously authenticated but lost their session */
  isSessionExpired: ComputedRef<boolean>
  /** Better Auth client for direct sign-in, sign-up, and provider actions. */
  client: AuthClient | null
  /** Force refresh Convex auth state after a Better Auth session change. */
  refreshAuth: () => Promise<void>
  /** Last auth error as an Error instance, or null when healthy. */
  authError: Readonly<Ref<Error | null>>
  /**
   * Signs out the user from both Better Auth and Convex.
   * De-authenticates Convex immediately, clears local auth state, then calls Better Auth's signOut().
   * Throws if upstream logout fails.
   */
  signOut: () => Promise<void>
}

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
 * const { user, isAuthenticated, isPending, signOut } = useConvexAuth()
 *
 * async function handleLogout() {
 *   await signOut()
 *   navigateTo('/login')
 * }
 * </script>
 * ```
 *
 * To sign in directly with Better Auth and refresh Convex auth state afterwards:
 * ```ts
 * const { client, refreshAuth } = useConvexAuth()
 * await client!.signIn.email({ email, password })
 * await refreshAuth()
 * ```
 */
export function useConvexAuth(): UseConvexAuthReturn {
  const auth = useConvexAuthController()

  return {
    user: readonly(auth.user),
    isAuthenticated: auth.isAuthenticated,
    isPending: readonly(auth.pending),
    isAnonymous: auth.isAnonymous,
    isSessionExpired: auth.isSessionExpired,
    client: auth.client,
    refreshAuth: auth.refreshAuth,
    authError: readonly(auth.authError),
    signOut: auth.signOut,
  }
}
