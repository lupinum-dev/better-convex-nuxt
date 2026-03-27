import type { ComputedRef, Ref } from 'vue'

import { useState, computed, readonly, useNuxtApp } from '#imports'

import {
  AUTH_REFRESH_TIMEOUT_MS,
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from '../utils/constants'
import { waitForPendingClear } from '../utils/auth-pending'
import type { ConvexUser } from '../utils/types'

export interface UseConvexAuthInternalReturn {
  /**
   * The raw JWT token used for Convex authentication.
   * Useful in middleware or plugins that need to attach the token manually.
   * For most components, use `useConvexAuth()` instead.
   */
  token: Readonly<Ref<string | null>>
  /**
   * Auth error message if authentication failed (e.g., 401/403 from the auth proxy).
   * Useful for middleware-level error handling.
   */
  authError: Readonly<Ref<string | null>>
  /**
   * Force refresh Convex auth state after login.
   * Triggers a fresh token fetch and updates all reactive auth state.
   * Deduplicates concurrent calls — only one refresh runs at a time.
   * Throws if refresh fails or times out.
   */
  refreshAuth: () => Promise<void>
  /**
   * Wait until initial auth bootstrap settles and return the final auth state.
   * Use in route middleware to avoid auth flicker races on hydration.
   * Returns `true` if authenticated, `false` if unauthenticated after settling.
   */
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
}

/**
 * Advanced auth composable for middleware, plugins, and internal module use.
 *
 * Exposes the raw token, auth error, and low-level auth control methods.
 * For component-level auth (user, isAuthenticated, signOut), use `useConvexAuth()`.
 *
 * @example Route middleware
 * ```ts
 * export default defineNuxtRouteMiddleware(async () => {
 *   const { awaitAuthReady } = useConvexAuthInternal()
 *   const isAuthenticated = await awaitAuthReady()
 *   if (!isAuthenticated) return navigateTo('/login')
 * })
 * ```
 *
 * @example After sign-in
 * ```ts
 * const { refreshAuth } = useConvexAuthInternal()
 * await authClient.signIn.email({ email, password })
 * await refreshAuth()  // syncs Convex token after Better Auth session is created
 * ```
 */
export function useConvexAuthInternal(): UseConvexAuthInternalReturn {
  const nuxtApp = useNuxtApp()
  const token = useState<string | null>(STATE_KEY_TOKEN, () => null)
  const pending = useState<boolean>(STATE_KEY_PENDING, () => import.meta.client)
  const authError = useState<string | null>(STATE_KEY_AUTH_ERROR, () => null)
  const user = useState<ConvexUser | null>(STATE_KEY_USER, () => null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

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
    authError: readonly(authError),
    refreshAuth,
    awaitAuthReady,
  }
}
