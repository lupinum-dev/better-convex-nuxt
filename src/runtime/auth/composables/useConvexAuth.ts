import type { ComputedRef, Ref } from 'vue'

import { useNuxtApp } from '#imports'

import type { AuthSessionUser } from '../../utils/types.js'
import { getConvexAuthRuntime, type ConvexAuthRuntime } from '../internal/auth-runtime.js'

// Re-export for convenience
export type { AuthSessionUser } from '../../utils/types.js'

export interface UseConvexAuthReturn {
  /** Authenticated session profile data (readonly). Does not expose app or provider ids. */
  sessionUser: Readonly<Ref<AuthSessionUser | null>>
  /** Whether the user is currently authenticated */
  isAuthenticated: ComputedRef<boolean>
  /** Whether auth is still initializing (true on client until first token fetch resolves) */
  isPending: Readonly<Ref<boolean>>
  /** True when not authenticated and not pending (reads better in templates than `!isAuthenticated`) */
  isAnonymous: ComputedRef<boolean>
  /** True when the user was previously authenticated but lost their session */
  isSessionExpired: ComputedRef<boolean>
  /** Re-sync Convex auth state after a Better Auth session change. Throws only on real refresh failure. */
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

export type { ConvexAuthRuntime }

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
 * const { sessionUser, isAuthenticated, isPending, signOut } = useConvexAuth()
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
 * const client = useBetterAuthClient()
 * const { refreshAuth } = useConvexAuth()
 * await client!.signIn.email({ email, password })
 * await refreshAuth()
 * ```
 *
 * `refreshAuth()` means "re-synchronize auth state", not "guarantee an authenticated token exists".
 * After it resolves, inspect `isAuthenticated`, `isAnonymous`, or `isSessionExpired` to decide what to do next.
 */
export function useConvexAuth(): UseConvexAuthReturn {
  return getConvexAuthRuntime(useNuxtApp())
}
