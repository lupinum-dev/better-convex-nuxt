import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'

import { useState, computed, readonly, useNuxtApp } from '#imports'

import type { ConvexAuthEngine } from '../auth/client-engine'
import { waitForPendingClear } from '../utils/auth-pending'
import { useConvexAuthPendingState } from '../utils/auth-pending-state'
import { deriveConvexAuthStatus, type ConvexAuthStatus } from '../utils/auth-status'
import { getConvexIdentityKey, type ConvexIdentityKey } from '../utils/identity-key'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
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
  /**
   * Canonical current-identity status (vNext §5.3), including `'disabled'` for a
   * Convex-only build. Orthogonal to {@link isPending}.
   */
  status: ComputedRef<ConvexAuthStatus>
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
  /** Signs out of both Better Auth and Convex. Resolves null when auth is disabled. */
  signOut: () => Promise<
    ReturnType<AuthClient['signOut']> extends Promise<infer T> ? T | null : null
  >
  /** Force refresh Convex auth state after login. No-op when auth is disabled. */
  refreshAuth: () => Promise<void>
  /** Wait until initial auth bootstrap settles; returns the settled auth boolean. */
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
  /** Raw Better Auth client for advanced/plugin-specific APIs. Null during SSR / disabled. */
  client: AuthClient | null
  /** Better Auth sign-in methods (client-only). */
  signIn: AuthClient['signIn']
  /** Better Auth sign-up methods (client-only). */
  signUp: AuthClient['signUp']
}

/**
 * Build the stable `disabled` auth contract (vNext §5.3) WITHOUT importing the
 * auth engine or Better Auth runtime. Registered unconditionally so
 * `useConvexAuth()` is always available; a Convex-only build gets this result.
 */
function createDisabledAuthResult(): UseConvexAuthReturn {
  const status = computed<ConvexAuthStatus>(() => 'disabled')
  const token = readonly(useState<string | null>('convex:token', () => null))
  const user = readonly(useState<ConvexUser | null>('convex:user', () => null))
  const authError = readonly(useState<string | null>('convex:authError', () => null))
  const isPending = readonly(useState<boolean>('convex:disabledPending', () => false))

  return {
    status,
    token,
    user,
    isAuthenticated: computed(() => false),
    isPending,
    authError,
    signOut: async () => null,
    refreshAuth: async () => {},
    awaitAuthReady: async () => false,
    client: null,
    signIn: createClientOnlyMethodProxy<AuthClient['signIn']>('signIn'),
    signUp: createClientOnlyMethodProxy<AuthClient['signUp']>('signUp'),
  }
}

/**
 * Access Convex authentication state (vNext §5.3). Auto-imported unconditionally.
 *
 * - Auth-disabled builds return the stable `disabled` contract.
 * - Auth-enabled builds derive the canonical `status` from the hydrated/engine
 *   state and delegate sign-out/refresh to the lazily resolved engine.
 *
 * @example
 * ```vue
 * <script setup>
 * const { user, status, signIn, signOut } = useConvexAuth()
 * </script>
 * ```
 */
export function useConvexAuth(): UseConvexAuthReturn {
  const nuxtApp = useNuxtApp()
  const authEnabled = getConvexRuntimeConfig().auth !== false
  if (!authEnabled) {
    return createDisabledAuthResult()
  }

  const token = useState<string | null>('convex:token', () => null)
  const user = useState<ConvexUser | null>('convex:user', () => null)
  const pending = useConvexAuthPendingState()
  const authError = useState<string | null>('convex:authError', () => null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const client = (nuxtApp.$auth as AuthClient | undefined) ?? null

  const status = computed<ConvexAuthStatus>(() => {
    if (pending.value) return 'loading'
    let identityKey: ConvexIdentityKey | null
    try {
      identityKey = getConvexIdentityKey(user.value)
    } catch {
      identityKey = 'anonymous'
    }
    return deriveConvexAuthStatus({
      authEnabled: true,
      settled: true,
      identityKey,
      error: authError.value ? { kind: 'authentication', message: authError.value } : null,
    })
  })

  // `$convexAuthEngine` is provided by the auth client plugin only — it never
  // exists during SSR. Resolve it lazily (only when signOut()/refreshAuth() are
  // actually called) instead of constructing a throwaway engine per call.
  const getAuthEngine = (): ConvexAuthEngine => {
    const engine = nuxtApp.$convexAuthEngine as ConvexAuthEngine | undefined
    if (!engine) {
      throw new Error(
        '[useConvexAuth] Convex auth engine is unavailable. signOut()/refreshAuth() are client-only — call them from a browser event handler after the module has initialized.',
      )
    }
    return engine
  }

  const signOut = async () => {
    return await getAuthEngine().signOut()
  }

  const refreshAuth = async (): Promise<void> => {
    return await getAuthEngine().refreshAuth()
  }

  const awaitAuthReady = async (options?: { timeoutMs?: number }): Promise<boolean> => {
    if (!import.meta.client) {
      return isAuthenticated.value
    }
    await waitForPendingClear(pending, { timeoutMs: options?.timeoutMs ?? 5_000 })
    return isAuthenticated.value
  }

  return {
    status,
    token: readonly(token),
    user: readonly(user),
    isAuthenticated,
    isPending: readonly(pending),
    authError: readonly(authError),
    signOut,
    refreshAuth,
    awaitAuthReady,
    client,
    signIn: client?.signIn ?? createClientOnlyMethodProxy<AuthClient['signIn']>('signIn'),
    signUp: client?.signUp ?? createClientOnlyMethodProxy<AuthClient['signUp']>('signUp'),
  }
}
