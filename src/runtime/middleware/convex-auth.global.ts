import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from '#app'

import { useConvexAuth } from '../composables/useConvexAuth'
import { AUTH_MIDDLEWARE_TIMEOUT_MS } from '../utils/constants'
import {
  resolveRouteProtectionDecision,
  type ConvexAuthPageMeta,
} from '../utils/auth-route-protection'
import { normalizeConvexRuntimeConfig } from '../utils/runtime-config'

export default defineNuxtRouteMiddleware(async (to) => {
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

  const { isAuthenticated, isPending, awaitAuthReady } = useConvexAuth()

  const decision = resolveRouteProtectionDecision({
    meta: pageMeta.convexAuth,
    defaultRedirectTo: authConfig.routeProtection.redirectTo,
    preserveReturnTo: authConfig.routeProtection.preserveReturnTo,
    currentPath: to.path,
    currentFullPath: to.fullPath,
  })

  if (!decision) return

  // For protected routes, wait for auth state to settle to avoid protected-content flashes.
  if (import.meta.client && isPending.value) {
    const authed = await awaitAuthReady({
      timeoutMs: AUTH_MIDDLEWARE_TIMEOUT_MS,
    })
    if (authed) return
  }

  if (import.meta.server && isPending.value) {
    // Avoid server-side waits; SSR should already have resolved auth.
    // Fall through to secure default route protection if still pending.
  }

  if (isAuthenticated.value) return
  return navigateTo(decision.redirectTo)
})
