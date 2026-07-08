import { api } from '#convex/api'

/**
 * Playground example: query Convex inside Nuxt route middleware.
 *
 * Route middleware is a one-shot navigation guard:
 * - client navigation uses useConvexCall()
 * - SSR navigation uses serverConvexQuery()
 */
export default defineNuxtRouteMiddleware(async () => {
  const context = import.meta.server
    ? await serverConvexQuery(useRequestEvent()!, api.auth.getPermissionContext, {})
    : await useConvexCall().query(api.auth.getPermissionContext)

  // For the playground demo, just require an authenticated permission context.
  // (Some users may not have a DB user row yet on first sign-in, and the playground
  // auto-creates it after page load.)
  if (!context) {
    return navigateTo('/auth/signin')
  }
})
