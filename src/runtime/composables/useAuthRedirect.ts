import { useRoute, useRuntimeConfig, navigateTo } from '#imports'

import { normalizeConvexAuthConfig } from '../utils/auth-config'
import { validateRedirectPath, resolveRedirectTarget } from '../utils/redirect-safety'

// Re-export pure functions so existing consumers keep working
export { validateRedirectPath, resolveRedirectTarget }

export interface UseAuthRedirectReturn {
  /**
   * Navigate to the post-auth destination.
   *
   * Reads `?redirect=` from the current URL (set by route protection middleware).
   * Falls back to `fallbackPath`. Rejects unsafe redirects and prevents login loops.
   */
  redirectAfterAuth: (fallbackPath?: string) => void
}

/**
 * Composable for safe post-login redirects.
 *
 * Reads the `?redirect=` query parameter set by the auth middleware,
 * validates it against open-redirect attacks, and navigates.
 *
 * @example
 * ```ts
 * const { redirectAfterAuth } = useAuthRedirect()
 *
 * await someCustomSignIn()
 * await refreshAuth()
 * redirectAfterAuth('/dashboard')
 * // Reads ?redirect param, prevents open redirects, prevents login-page loops
 * ```
 */
export function useAuthRedirect(): UseAuthRedirectReturn {
  const route = useRoute()
  const runtimeConfig = useRuntimeConfig()

  const redirectAfterAuth = (fallbackPath: string = '/') => {
    const raw = route.query.redirect
    const rawStr = typeof raw === 'string' ? raw : null

    // Get the login page path from auth config for loop prevention
    const authConfig = normalizeConvexAuthConfig(
      (runtimeConfig.public.convex as Record<string, unknown> | undefined)?.auth,
    )
    const loginPath = typeof authConfig.routeProtection.redirectTo === 'string'
      ? authConfig.routeProtection.redirectTo
      : undefined

    const target = resolveRedirectTarget(rawStr, fallbackPath, loginPath)
    navigateTo(target)
  }

  return { redirectAfterAuth }
}
