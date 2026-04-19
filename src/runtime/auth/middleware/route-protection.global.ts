import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from '#app'

import { normalizeConvexRuntimeConfig } from '../../convex/shared/runtime-config.js'
import { AUTH_MIDDLEWARE_TIMEOUT_MS } from '../../utils/constants.js'
import { useConvexAuth } from '../composables/useConvexAuth.js'
import { useConvexAuthController } from '../internal/useConvexAuthController.js'
import {
  resolveRouteProtectionDecision,
  type ConvexAuthPageMeta,
} from '../shared/auth-route-protection.js'

export default defineNuxtRouteMiddleware(async (to) => {
  const authConfig = normalizeConvexRuntimeConfig(useRuntimeConfig().public.convex).auth
  if (!authConfig.enabled) return

  const pageMeta = to.meta as { convexAuth?: ConvexAuthPageMeta; skipAuthTokenFetch?: boolean }

  if (import.meta.dev && pageMeta.skipAuthTokenFetch === true && pageMeta.convexAuth) {
    console.warn(
      '[trellis] Page sets both `skipAuthTokenFetch: true` and `convexAuth`. ' +
        '`skipAuthTokenFetch` only skips auth token fetches; `convexAuth` protects the route.',
      { path: to.fullPath },
    )
  }

  const { isAuthenticated, isPending } = useConvexAuth()
  const { awaitAuthReady } = useConvexAuthController()

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
