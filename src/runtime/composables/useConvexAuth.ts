import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'

import { useState, computed, readonly, useNuxtApp } from '#imports'

import { AUTH_REFRESH_TIMEOUT_MS } from '../utils/constants'
import {
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from '../utils/constants'
import { waitForPendingClear } from '../utils/auth-pending'
import type { ConvexUser } from '../utils/types'

// Re-export for convenience
export type { ConvexUser } from '../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

export interface UseConvexAuthReturn {
  /** The JWT token for Convex authentication (readonly) */
  token: Readonly<Ref<string | null>>
  /** The authenticated user data (readonly) */
  user: Readonly<Ref<ConvexUser | null>>
  /** Whether the user is authenticated */
  isAuthenticated: ComputedRef<boolean>
  /** Whether an auth operation is pending */
  isPending: Readonly<Ref<boolean>>
  /** Auth error message if authentication failed (e.g., 401/403) */
  authError: Readonly<Ref<string | null>>
  /**
   * Signs out the user from both Better Auth and Convex.
   * Clears local state immediately and calls Better Auth's signOut().
   */
  signOut: () => Promise<
    ReturnType<AuthClient['signOut']> extends Promise<infer T> ? T | null : null
  >
  /**
   * Force refresh Convex auth state after login.
   * Triggers fresh token fetch and updates reactive state.
   */
  refreshAuth: () => Promise<void>
  /**
   * Wait until initial auth bootstrap settles and return the final auth state.
   * Useful in route middleware to avoid auth flicker races on hydration.
   */
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
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
 * To sign in, import the Better Auth client directly:
 * ```ts
 * import { createAuthClient } from 'better-auth/vue'
 * const authClient = createAuthClient({ baseURL: '/api/auth' })
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

  const refreshAuth = async (): Promise<void> => {
    const appState = nuxtApp as typeof nuxtApp & {
      _convexRefreshAuthPromise?: Promise<void> | null
    }
    if (appState._convexRefreshAuthPromise) {
      return appState._convexRefreshAuthPromise
    }

    appState._convexRefreshAuthPromise = (async () => {
      pending.value = true
      authError.value = null

      try {
        await Promise.race([
          nuxtApp.callHook('better-convex:auth:refresh'),
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => {
              if (import.meta.dev) {
                console.warn(
                  `[better-convex-nuxt] Auth refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms. Check auth configuration.`,
                )
              }
              reject(new Error(`Authentication refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms`))
            }, AUTH_REFRESH_TIMEOUT_MS)
          }),
        ])

        if (token.value) return
        if (authError.value) throw new Error(authError.value)

        authError.value = 'Authentication refresh completed without a token'
        throw new Error(authError.value)
      } catch (error) {
        authError.value = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        pending.value = false
        appState._convexRefreshAuthPromise = null
      }
    })()

    return appState._convexRefreshAuthPromise
  }

  const awaitAuthReady = async (options?: { timeoutMs?: number }): Promise<boolean> => {
    if (!import.meta.client) {
      return isAuthenticated.value
    }

    await waitForPendingClear(pending, {
      timeoutMs: options?.timeoutMs ?? AUTH_REFRESH_TIMEOUT_MS,
    })

    if (import.meta.dev && !isAuthenticated.value && pending.value) {
      console.warn(
        `[better-convex-nuxt] Auth state did not settle within ${options?.timeoutMs ?? AUTH_REFRESH_TIMEOUT_MS}ms. Check auth configuration.`,
      )
    }

    return isAuthenticated.value
  }

  return {
    token: readonly(token),
    user: readonly(user),
    isAuthenticated,
    isPending: readonly(pending),
    authError: readonly(authError),
    signOut,
    refreshAuth,
    awaitAuthReady,
  }
}
