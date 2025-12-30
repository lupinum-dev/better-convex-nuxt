import type { createAuthClient } from 'better-auth/vue'

import { useNuxtApp } from '#imports'

type AuthClient = ReturnType<typeof createAuthClient>

/**
 * Composable for accessing the Better Auth client instance.
 *
 * Returns the auth client that is:
 * - Configured with the auth server URL
 * - Integrated with Convex for token synchronization
 * - Ready for sign-in, sign-out, and session management
 *
 * SSR-safe: Can be called during component setup. Returns null during SSR,
 * but this is safe because auth operations (sign in, sign out) should only
 * be triggered by user interactions which only happen on the client.
 *
 * @example
 * ```vue
 * <script setup>
 * // Safe to call at setup time - returns null on SSR, client on browser
 * const authClient = useAuthClient()
 *
 * // Auth operations are event handlers - only run on client
 * async function login(email: string, password: string) {
 *   const { data, error } = await authClient!.signIn.email({
 *     email,
 *     password
 *   })
 * }
 *
 * async function logout() {
 *   await authClient?.signOut()
 * }
 * </script>
 * ```
 */
export function useAuthClient(): AuthClient | null {
  const nuxtApp = useNuxtApp()
  const auth = nuxtApp.$auth as AuthClient | undefined

  // Return null during SSR - auth client only works on client
  // This is safe because auth operations should only be triggered by user
  // interactions (clicks, form submits) which only happen on the client
  return auth ?? null
}
