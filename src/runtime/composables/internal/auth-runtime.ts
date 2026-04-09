import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'
import { readonly } from 'vue'

import { getSharedAuthEngine } from '../../client/auth-engine'
import type { ConvexUser } from '../../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

export interface ConvexAuthRuntime {
  user: Readonly<Ref<ConvexUser | null>>
  isAuthenticated: ComputedRef<boolean>
  isPending: Readonly<Ref<boolean>>
  isAnonymous: ComputedRef<boolean>
  isSessionExpired: ComputedRef<boolean>
  client: AuthClient | null
  refreshAuth: () => Promise<void>
  authError: Readonly<Ref<Error | null>>
  signOut: () => Promise<void>
}

export function getConvexAuthRuntime(nuxtApp: object): ConvexAuthRuntime {
  const auth = getSharedAuthEngine(nuxtApp)

  return {
    user: readonly(auth.user),
    isAuthenticated: auth.isAuthenticated,
    isPending: readonly(auth.pending),
    isAnonymous: auth.isAnonymous,
    isSessionExpired: auth.isSessionExpired,
    client: auth.client,
    refreshAuth: () => auth.refreshAuth(),
    authError: readonly(auth.authError),
    signOut: auth.signOut,
  }
}
