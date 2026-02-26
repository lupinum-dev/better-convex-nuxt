import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from '#app'

import { useAuth } from '../composables/useAuth'
import { resolveRouteProtectionDecision, type ConvexAuthPageMeta } from '../utils/auth-route-protection'
import { normalizeConvexRuntimeConfig } from '../utils/runtime-config'

export default defineNuxtRouteMiddleware((to) => {
  const authConfig = normalizeConvexRuntimeConfig(useRuntimeConfig().public.convex).auth
  if (!authConfig.enabled) return

  const pageMeta = to.meta as { convexAuth?: ConvexAuthPageMeta; skipConvexAuth?: boolean }

  if (import.meta.dev && pageMeta.skipConvexAuth === true && pageMeta.convexAuth) {
    console.warn(
      '[better-convex-nuxt] Page sets both `skipConvexAuth: true` and `convexAuth`. ' +
        '`skipConvexAuth` only skips auth checks for query token fetches; `convexAuth` protects the route.',
      { path: to.fullPath },
    )
  }

  const { isAuthenticated, isPending } = useAuth()

  // On first client hydration auth may still be settling; avoid redirecting prematurely.
  if (isPending.value) return
  if (isAuthenticated.value) return

  const decision = resolveRouteProtectionDecision({
    meta: pageMeta.convexAuth,
    defaultRedirectTo: authConfig.routeProtection.redirectTo,
    preserveReturnTo: authConfig.routeProtection.preserveReturnTo,
    currentPath: to.path,
    currentFullPath: to.fullPath,
  })

  if (!decision) return
  return navigateTo(decision.redirectTo)
})
