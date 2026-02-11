import { useState, computed, readonly, useNuxtApp, watch } from '#imports'

import type { ConvexUser } from '../utils/types'
import type { createAuthClient } from 'better-auth/vue'

// Re-export for convenience
export type { ConvexUser } from '../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

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
 *
 * <template>
 *   <div v-if="isPending">Loading...</div>
 *   <div v-else-if="isAuthenticated">
 *     Welcome, {{ user?.name }}
 *     <button @click="handleLogout">Sign out</button>
 *   </div>
 *   <div v-else>Please log in</div>
 * </template>
 * ```
 */
export function useConvexAuth() {
  const nuxtApp = useNuxtApp()
  const token = useState<string | null>('convex:token', () => null)
  const user = useState<ConvexUser | null>('convex:user', () => null)
  // Start pending=true until the client plugin resolves the first auth fetch cycle.
  const pending = useState<boolean>('convex:pending', () => true)
  const authError = useState<string | null>('convex:authError', () => null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  /**
   * Signs out the user from both Better Auth and clears Convex auth state.
   *
   * This is the recommended way to sign out as it:
   * 1. Calls Better Auth's signOut() to clear the session cookie
   * 2. Clears the local Convex token/user state immediately
   *
   * Using this instead of `authClient.signOut()` directly ensures
   * the Convex auth state is cleared atomically with the session.
   *
   * @returns The result from Better Auth's signOut call, or null if auth client unavailable
   *
   * @example
   * ```ts
   * const { signOut } = useConvexAuth()
   *
   * async function handleLogout() {
   *   await signOut()
   *   navigateTo('/login')
   * }
   * ```
   */
  const signOut = async () => {
    const authClient = nuxtApp.$auth as AuthClient | undefined

    // Clear local state immediately for responsive UI
    token.value = null
    user.value = null
    authError.value = null

    // Call Better Auth signOut if available
    if (authClient) {
      try {
        return await authClient.signOut()
      } catch (e) {
        // Still consider signout successful since local state is cleared
        // The session cookie may still be cleared even if the request failed
        console.warn('signOut request failed:', e)
        return null
      }
    }

    return null
  }

  /**
   * Force refresh the Convex authentication state.
   * Call this after Better Auth login to sync the new session with Convex.
   *
   * @returns Promise that resolves when auth state has settled (token populated or error)
   *
   * @example
   * ```ts
   * const { refreshAuth } = useConvexAuth()
   *
   * async function handleLogin() {
   *   await authClient.signIn.email({ email, password })
   *   await refreshAuth() // Sync new session with Convex
   *   navigateTo('/dashboard')
   * }
   * ```
   */
  const refreshAuth = async (): Promise<void> => {
    pending.value = true

    // Clear any previous auth error before refreshing
    authError.value = null

    const refreshSignal = useState<number>('convex:refreshSignal', () => 0)
    refreshSignal.value++

    // Wait for auth to settle (token populated or error)
    await new Promise<void>((resolve) => {
      let resolved = false
      let stopWatcher: (() => void) | null = null

      const cleanup = () => {
        if (!resolved) {
          resolved = true
          if (stopWatcher) stopWatcher()
          resolve()
        }
      }

      stopWatcher = watch(
        [token, authError],
        ([newToken, newError]) => {
          // Only settle on token (success) or new error after refresh
          if (newToken) {
            cleanup()
          } else if (newError && resolved === false) {
            // Only treat as settled if we got a new error after the refresh started
            cleanup()
          }
        }
      )

      // Timeout fallback (5s)
      setTimeout(cleanup, 5000)
    })

    pending.value = false
  }

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
    /**
     * Signs out the user from both Better Auth and Convex.
     * Clears local state immediately and calls Better Auth's signOut().
     */
    signOut,
    /**
     * Force refresh Convex auth state after login.
     * Triggers fresh token fetch and updates reactive state.
     */
    refreshAuth,
  }
}
