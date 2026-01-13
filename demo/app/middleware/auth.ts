/**
 * Auth middleware for protected routes
 *
 * Redirects unauthenticated users to sign-in page.
 */
export default defineNuxtRouteMiddleware(() => {
  const { isAuthenticated, isPending } = useConvexAuth()

  // Wait for auth to load
  if (isPending.value) {
    return
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated.value) {
    return navigateTo('/')
  }
})
