import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'
import { readonly } from 'vue'

import type { AuthSessionUser } from '../../utils/types.js'
import { getSharedAuthEngine, hasSharedAuthEngine } from '../client/auth-engine.js'

type AuthClient = ReturnType<typeof createAuthClient>

export interface ConvexAuthRuntime {
  sessionUser: Readonly<Ref<AuthSessionUser | null>>
  isAuthenticated: ComputedRef<boolean>
  isPending: Readonly<Ref<boolean>>
  isAnonymous: ComputedRef<boolean>
  isSessionExpired: ComputedRef<boolean>
  refreshAuth: () => Promise<void>
  authError: Readonly<Ref<Error | null>>
  signOut: () => Promise<void>
}

export function getConvexAuthRuntime(nuxtApp: object): ConvexAuthRuntime {
  const auth = getSharedAuthEngine(nuxtApp)

  return {
    sessionUser: readonly(auth.user),
    isAuthenticated: auth.isAuthenticated,
    isPending: readonly(auth.pending),
    isAnonymous: auth.isAnonymous,
    isSessionExpired: auth.isSessionExpired,
    refreshAuth: () => auth.refreshAuth(),
    authError: readonly(auth.authError),
    signOut: auth.signOut,
  }
}

export function getBetterAuthClient(nuxtApp: object): AuthClient | null {
  return getSharedAuthEngine(nuxtApp).client
}

export function hasConvexAuthRuntime(nuxtApp: object): boolean {
  return hasSharedAuthEngine(nuxtApp)
}
