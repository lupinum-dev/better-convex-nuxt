/**
 * Auth middleware for protected routes
 *
 * Redirects unauthenticated users to sign-in page.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated, isPending } = useConvexAuth()

  // Wait for auth to load
  if (isPending.value) {
    return
  }

  // Redirect to sign-in if not authenticated
  if (!isAuthenticated.value) {
    return navigateTo({
      path: '/auth/signin',
      query: { redirect: to.fullPath }
    })
  }
})
