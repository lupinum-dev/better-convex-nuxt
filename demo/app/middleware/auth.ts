/**
 * Auth middleware for protected routes
 *
 * Redirects unauthenticated users to sign-in page.
 */
export default defineNuxtRouteMiddleware(() => {
  const { isAuthenticated } = useConvexAuth()
  const authReady = useAuthReady()

  // Wait for auth to resolve
  if (!authReady.value) {
    return
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated.value) {
    return navigateTo('/signin')
  }
})
