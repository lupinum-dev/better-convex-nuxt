import { useState, computed, readonly, useNuxtApp, watch } from '#imports'

import type { ConvexUser } from '../utils/types'
import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'
import { waitForPendingClear } from '../utils/auth-pending'

// Re-export for convenience
export type { ConvexUser } from '../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

function createClientOnlyMethodProxy<T>(name: 'signIn' | 'signUp'): T {
  const buildProxy = (path: string[]): unknown => {
    const fn = () => {}
    return new Proxy(fn, {
      get(_target, prop) {
        if (prop === 'then') return undefined
        if (typeof prop === 'symbol') return undefined
        return buildProxy([...path, prop])
      },
      apply() {
        const methodPath = path.join('.')
        const message
          = `[useConvexAuth] \`${methodPath}\` is client-only. Call it from a browser event handler and ensure auth is enabled.`
        if (import.meta.dev) {
          console.warn(message)
        }
        return Promise.resolve({
          data: null,
          error: { message },
        })
      },
    })
  }

  return buildProxy([name]) as T
}

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
  signOut: () => Promise<ReturnType<AuthClient['signOut']> extends Promise<infer T> ? T | null : null>
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
  /**
   * Raw Better Auth client for advanced/plugin-specific APIs.
   * Returns null during SSR.
   */
  client: AuthClient | null
  /**
   * Better Auth sign-in methods (client-only).
   * During SSR, returns a proxy that warns if called.
   * @example `signIn.email({ email, password })`
   */
  signIn: AuthClient['signIn']
  /**
   * Better Auth sign-up methods (client-only).
   * During SSR, returns a proxy that warns if called.
   * @example `signUp.email({ name, email, password })`
   */
  signUp: AuthClient['signUp']
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
 * const { user, isAuthenticated, isPending, signIn, signOut } = useConvexAuth()
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
export function useConvexAuth(): UseConvexAuthReturn {
  const nuxtApp = useNuxtApp()
  const token = useState<string | null>('convex:token', () => null)
  const user = useState<ConvexUser | null>('convex:user', () => null)
  // SSR auth is already settled before render, so default false on server to avoid
  // hydration mismatches. CSR-first loads still start pending=true until client init.
  const pending = useState<boolean>('convex:pending', () => import.meta.client)
  const authError = useState<string | null>('convex:authError', () => null)
  const refreshSignal = useState<number>('convex:refreshSignal', () => 0)
  const refreshCompleteSignal = useState<number>('convex:refreshCompleteSignal', () => 0)

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
    const appState = nuxtApp as typeof nuxtApp & { _convexRefreshAuthPromise?: Promise<void> | null }
    if (appState._convexRefreshAuthPromise) {
      return appState._convexRefreshAuthPromise
    }

    appState._convexRefreshAuthPromise = (async () => {
      pending.value = true
      authError.value = null

      const startCompleteSignal = refreshCompleteSignal.value
      refreshSignal.value++

      try {
        await new Promise<void>((resolve, reject) => {
          let settled = false
          let stopWatcher: (() => void) | null = null
          let timeout: ReturnType<typeof setTimeout> | null = null

          const cleanup = () => {
            if (stopWatcher) {
              stopWatcher()
              stopWatcher = null
            }
            if (timeout) {
              clearTimeout(timeout)
              timeout = null
            }
          }

          const settleResolve = () => {
            if (settled) return
            settled = true
            cleanup()
            resolve()
          }

          const settleReject = (error: unknown) => {
            if (settled) return
            settled = true
            cleanup()
            reject(error instanceof Error ? error : new Error(String(error)))
          }

          stopWatcher = watch(
            [refreshCompleteSignal, token, authError],
            ([completed, newToken, newError]) => {
              if (completed <= startCompleteSignal) return
              if (newToken) {
                settleResolve()
                return
              }
              if (newError) {
                settleReject(new Error(newError))
                return
              }
              authError.value = 'Authentication refresh completed without a token'
              settleReject(new Error(authError.value))
            },
            { immediate: true },
          )

          timeout = setTimeout(() => {
            authError.value = 'Authentication refresh timed out after 5 seconds'
            settleReject(new Error(authError.value))
          }, 5000)
        })
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
      timeoutMs: options?.timeoutMs ?? 5_000,
    })
    return isAuthenticated.value
  }

  const client = (nuxtApp.$auth as AuthClient | undefined) ?? null

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
    /**
     * Wait until initial auth bootstrap settles and return the final auth state.
     * Useful in route middleware to avoid auth flicker races on hydration.
     */
    awaitAuthReady,
    /** Raw Better Auth client for advanced/plugin-specific APIs. Null during SSR. */
    client,
    /** Better Auth sign-in methods (client-only). */
    signIn: client?.signIn ?? createClientOnlyMethodProxy<AuthClient['signIn']>('signIn'),
    /** Better Auth sign-up methods (client-only). */
    signUp: client?.signUp ?? createClientOnlyMethodProxy<AuthClient['signUp']>('signUp'),
  }
}
