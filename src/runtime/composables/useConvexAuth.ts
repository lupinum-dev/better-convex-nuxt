import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'
import { watch } from 'vue'

import { useState, computed, readonly, useNuxtApp } from '#imports'

import {
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from '../utils/constants'
import type { ConvexUser } from '../utils/types'

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
  /**
   * Signs out the user from both Better Auth and Convex.
   * Clears local state immediately, then calls Better Auth's signOut().
   */
  signOut: () => Promise<
    ReturnType<AuthClient['signOut']> extends Promise<infer T> ? T | null : null
  >
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
 * To sign in and refresh Convex auth state afterwards:
 * ```ts
 * import { createAuthClient } from 'better-auth/vue'
 * const authClient = createAuthClient({ baseURL: '/api/auth' })
 * const { refreshAuth } = useConvexAuthInternal()
 * await authClient.signIn.email({ email, password })
 * await refreshAuth()
 * ```
 */
export function useConvexAuth(): UseConvexAuthReturn {
  const nuxtApp = useNuxtApp()
  const token = useState<string | null>(STATE_KEY_TOKEN, () => null)
  const user = useState<ConvexUser | null>(STATE_KEY_USER, () => null)
  // SSR auth is already settled before render, so default false on server to avoid
  // hydration mismatches. CSR-first loads still start pending=true until client init.
  const pending = useState<boolean>(STATE_KEY_PENDING, () => import.meta.client)
  const authError = useState<string | null>(STATE_KEY_AUTH_ERROR, () => null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isAnonymous = computed(() => !pending.value && !isAuthenticated.value)

  // Track whether the user was ever authenticated in this session.
  // Uses useState so the flag survives SSR → client hydration.
  const wasAuthenticated = useState<boolean>('better-convex:was-authenticated', () => !!token.value && !!user.value)
  if (isAuthenticated.value) {
    wasAuthenticated.value = true
  }
  watch(isAuthenticated, (val) => {
    if (val) wasAuthenticated.value = true
  })
  const isSessionExpired = computed(() => !pending.value && !isAuthenticated.value && wasAuthenticated.value)

  const signOut = async () => {
    const authClient = nuxtApp.$auth as AuthClient | undefined

    // Clear local state immediately for responsive UI
    token.value = null
    user.value = null
    authError.value = null

    if (authClient) {
      try {
        return await authClient.signOut()
      } catch (e) {
        console.warn('signOut request failed:', e)
        return null
      }
    }

    return null
  }

  return {
    user: readonly(user),
    isAuthenticated,
    isPending: readonly(pending),
    isAnonymous,
    isSessionExpired,
    signOut,
  }
}
