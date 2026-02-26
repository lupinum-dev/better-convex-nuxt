import { api } from '~~/convex/_generated/api'

/**
 * Playground example: query Convex inside Nuxt route middleware.
 *
 * Important: route middleware is a one-shot navigation guard, so disable
 * real-time subscriptions with `subscribe: false`.
 */
export default defineNuxtRouteMiddleware(async () => {
  const { data: context } = await useConvexQuery(
    api.auth.getPermissionContext,
    {},
    {
      server: true,
      subscribe: false,
    },
  )

  // For the playground demo, just require an authenticated permission context.
  // (Some users may not have a DB user row yet on first sign-in, and the playground
  // auto-creates it after page load.)
  if (!context.value) {
    return navigateTo('/auth/signin')
  }
})
