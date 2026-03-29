/**
 * Internal composable that exposes the full auth engine surface to
 * other composables and internal code.
 *
 * This is a thin facade over `SharedAuthEngine` — it exists so that
 * composables don't import the engine factory directly. The engine
 * must already be created by `plugin.client.ts` before this composable
 * is called; if not, `getSharedAuthEngine` throws.
 *
 * Public consumers use `useConvexAuth()` which exposes a smaller surface.
 * This controller adds `token`, `rawAuthError`, `wasAuthenticated`, and
 * mutation methods (`refreshAuth`, `signOut`, `awaitAuthReady`).
 *
 * @module useConvexAuthController
 */
import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'

import { useNuxtApp } from '#imports'

import { getSharedAuthEngine } from '../../client/auth-engine'
import type { ConvexUser } from '../../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

/** Full auth controller surface for internal composables. */
export interface ConvexAuthController {
  token: Ref<string | null>
  user: Ref<ConvexUser | null>
  pending: Ref<boolean>
  rawAuthError: Ref<string | null>
  wasAuthenticated: Ref<boolean>
  authError: ComputedRef<Error | null>
  isAuthenticated: ComputedRef<boolean>
  isAnonymous: ComputedRef<boolean>
  isSessionExpired: ComputedRef<boolean>
  client: AuthClient | null
  refreshAuth: () => Promise<void>
  signOut: () => Promise<void>
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
}

export function useConvexAuthController(): ConvexAuthController {
  const engine = getSharedAuthEngine(useNuxtApp())

  return {
    token: engine.token,
    user: engine.user,
    pending: engine.pending,
    rawAuthError: engine.rawAuthError,
    wasAuthenticated: engine.wasAuthenticated,
    authError: engine.authError,
    isAuthenticated: engine.isAuthenticated,
    isAnonymous: engine.isAnonymous,
    isSessionExpired: engine.isSessionExpired,
    get client() {
      return engine.client
    },
    refreshAuth: engine.refreshAuth,
    signOut: engine.signOut,
    awaitAuthReady: engine.awaitAuthReady,
  }
}
