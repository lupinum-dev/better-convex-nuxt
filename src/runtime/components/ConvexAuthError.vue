<script setup lang="ts">
/**
 * Renders slot content when authentication has failed or encountered an error.
 * Use this to display error messages or retry UI when auth operations fail.
 *
 * Checks for auth error state:
 * - Token decode error (user has token but no decoded user)
 * - Explicit auth failure (401/403 from token endpoint)
 *
 * @example
 * ```vue
 * <ConvexAuthError>
 *   <div class="error">
 *     <p>Authentication failed. Please try again.</p>
 *     <button @click="handleRetry">Retry</button>
 *   </div>
 * </ConvexAuthError>
 * ```
 *
 * @example With custom error handling
 * ```vue
 * <ConvexAuthError v-slot="{ retry, error }">
 *   <ErrorCard
 *     :message="error || 'Session expired'"
 *     :onRetry="retry"
 *   />
 * </ConvexAuthError>
 * ```
 */
import { computed } from 'vue'
import { useConvexAuth } from '../composables/useConvexAuth'

const { isAuthenticated, isPending, token, user, authError } = useConvexAuth()

/**
 * Detect auth error state:
 * - Not pending (auth check complete)
 * - Not authenticated
 * - Has explicit auth error OR has token but no user (decode error)
 */
const hasError = computed(() => {
  // Auth is still loading
  if (isPending.value) return false

  // Successfully authenticated
  if (isAuthenticated.value) return false

  // Explicit auth error from token fetch (401/403)
  if (authError.value) return true

  // Has token but no user = potential decode error
  if (token.value && !user.value) return true

  return false
})

/**
 * Retry authentication by reloading the page
 */
function retry() {
  window.location.reload()
}
</script>

<template>
  <slot v-if="hasError" :retry="retry" :error="authError" />
</template>
