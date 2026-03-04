import { api } from '~~/convex/_generated/api'

/**
 * Playground example: query Convex inside Nuxt route middleware.
 *
 * Route middleware is a one-shot navigation guard:
 * - client navigation uses useConvexRpc()
 * - SSR navigation uses serverConvexQuery()
 */
export default defineNuxtRouteMiddleware(async () => {
  const context = import.meta.server
    ? await serverConvexQuery(api.auth.getPermissionContext, {})
    : await useConvexRpc({ timeoutMs: 5000 }).query(api.auth.getPermissionContext, {})

  // For the playground demo, just require an authenticated permission context.
  // (Some users may not have a DB user row yet on first sign-in, and the playground
  // auto-creates it after page load.)
  if (!context) {
    return navigateTo('/auth/signin')
  }
})
