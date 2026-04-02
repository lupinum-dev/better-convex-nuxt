import { readonly } from 'vue'

import { getSharedAuthEngine } from '../../client/auth-engine'

export function getConvexAuthRuntime(nuxtApp: object) {
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
