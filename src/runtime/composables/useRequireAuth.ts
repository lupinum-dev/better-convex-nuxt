import { watchEffect } from '#imports'
import { navigateTo, useRoute } from '#imports'
import { useAuthReady } from './useAuthReady'
import { useConvexAuth } from './useConvexAuth'

interface RequireAuthOptions {
  redirectTo?: string
}

export function useRequireAuth(options: RequireAuthOptions = {}) {
  const { isAuthenticated } = useConvexAuth()
  const authReady = useAuthReady()
  const route = useRoute()
  const redirectTo = options.redirectTo ?? '/signin'

  watchEffect(() => {
    if (!authReady.value || isAuthenticated.value) return
    if (route.path === redirectTo) return
    navigateTo(redirectTo)
  })

  return {
    authReady,
    isAuthenticated,
  }
}
