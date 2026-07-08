import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'

import { useState, computed, readonly, useNuxtApp } from '#imports'

import type { ConvexAuthEngine } from '../auth/client-engine'
import { waitForPendingClear } from '../utils/auth-pending'
import { useConvexAuthPendingState } from '../utils/auth-pending-state'
import type { ConvexUser } from '../utils/types'

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
        const message = `[useConvexAuth] \`${methodPath}\` is client-only. Call it from a browser event handler and ensure auth is enabled.`
        if (import.meta.dev) {
          console.warn(message)
        }
        return Promise.reject(new Error(message))
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
   * Clears local state after Better Auth signOut succeeds.
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
  const pending = useConvexAuthPendingState()
  const authError = useState<string | null>('convex:authError', () => null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const client = (nuxtApp.$auth as AuthClient | undefined) ?? null

  // `$convexAuthEngine` is provided by the client plugin only — it never
  // exists during SSR. Resolve it lazily (only when signOut()/refreshAuth()
  // are actually called) instead of silently constructing a throwaway engine
  // per composable call, which masked a real "used before ready" bug (F-34).
  const getAuthEngine = (): ConvexAuthEngine => {
    const engine = nuxtApp.$convexAuthEngine as ConvexAuthEngine | undefined
    if (!engine) {
      throw new Error(
        '[useConvexAuth] Convex auth engine is unavailable. signOut()/refreshAuth() are client-only — call them from a browser event handler after the module has initialized.',
      )
    }
    return engine
  }

  /**
   * Signs out the user from both Better Auth and clears Convex auth state.
   *
   * This is the recommended way to sign out as it:
   * 1. Calls Better Auth's signOut() to clear the session cookie
   * 2. Clears the local Convex token/user state after Better Auth succeeds
   *
   * Using this instead of `authClient.signOut()` directly ensures
   * local Convex auth state is not cleared while the Better Auth session
   * may still be valid.
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
    return await getAuthEngine().signOut()
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
    return await getAuthEngine().refreshAuth()
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
     * Clears local state after Better Auth succeeds.
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
