import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from '#app'

import { useConvexAuth } from '../composables/useConvexAuth'
import { resolveRouteProtectionDecision, type ConvexAuthPageMeta } from '../utils/auth-route-protection'
import { normalizeConvexRuntimeConfig } from '../utils/runtime-config'
import { waitForPendingClear } from '../utils/auth-pending'

const PROTECTED_ROUTE_AUTH_SETTLE_TIMEOUT_MS = 5_000

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

  const { isAuthenticated, isPending } = useConvexAuth()

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
    const settled = await waitForPendingClear(isPending, {
      timeoutMs: PROTECTED_ROUTE_AUTH_SETTLE_TIMEOUT_MS,
      onTimeout: () => {
        if (import.meta.dev) {
          console.warn(
            '[better-convex-nuxt] Auth middleware pending timeout on protected route; treating as unauthenticated.',
            { path: to.fullPath, timeoutMs: PROTECTED_ROUTE_AUTH_SETTLE_TIMEOUT_MS },
          )
        }
      },
    })
    // Timeout falls through to unauthenticated redirect (secure default).
    if (!settled && isAuthenticated.value) return
  }

  if (import.meta.server && isPending.value) {
    // Avoid server-side waits; SSR should already have resolved auth.
    // Fall through to secure default route protection if still pending.
  }

  if (isAuthenticated.value) return
  return navigateTo(decision.redirectTo)
})
