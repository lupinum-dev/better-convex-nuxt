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
 * @example With structured error handling
 * ```vue
 * <ConvexAuthError v-slot="{ retry, retrying, error, structuredError, isRecoverable }">
 *   <div v-if="isRecoverable">
 *     <p>Session expired.</p>
 *     <button @click="retry" :disabled="retrying">Try again</button>
 *   </div>
 *   <div v-else>
 *     <p>{{ error }}</p>
 *   </div>
 * </ConvexAuthError>
 * ```
 */
import { computed, ref } from 'vue'
import { useConvexAuth } from '../composables/useConvexAuth'
import { useConvexAuthInternal } from '../composables/useConvexAuthInternal'
import type { ConvexErrorCategory } from '../utils/types'

interface StructuredAuthError {
  message: string
  category: ConvexErrorCategory
  isRecoverable: boolean
  isTokenDecode: boolean
  isExplicitFailure: boolean
}

defineSlots<{
  default(props: {
    /** Retry authentication via refreshAuth() (not a page reload). */
    retry: () => Promise<void>
    /** True while a retry is in progress. */
    retrying: boolean
    /** Raw error string for backwards compatibility. */
    error: string | null
    /** Structured error with category and recoverability info. */
    structuredError: StructuredAuthError | null
    /** Whether the error is likely recoverable (shorthand). */
    isRecoverable: boolean
  }): unknown
}>()

const { isAuthenticated, isPending, user } = useConvexAuth()
const { token, authError, refreshAuth } = useConvexAuthInternal()

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

const retrying = ref(false)

/**
 * Retry authentication by calling refreshAuth() instead of a full page reload.
 */
async function retry() {
  if (retrying.value) return
  retrying.value = true
  try {
    await refreshAuth()
  } catch {
    // refreshAuth failed — authError state is updated by refreshAuth itself
  } finally {
    retrying.value = false
  }
}

const structuredError = computed<StructuredAuthError | null>(() => {
  if (!hasError.value) return null
  const isTokenDecode = !!(token.value && !user.value)
  const isExplicitFailure = !!authError.value
  return {
    message: authError.value || (isTokenDecode ? 'Failed to decode auth token' : 'Authentication error'),
    category: 'auth' as ConvexErrorCategory,
    isRecoverable: true,
    isTokenDecode,
    isExplicitFailure,
  }
})

const isRecoverable = computed(() => structuredError.value?.isRecoverable ?? false)
</script>

<template>
  <slot
    v-if="hasError"
    :retry="retry"
    :retrying="retrying"
    :error="authError"
    :structured-error="structuredError"
    :is-recoverable="isRecoverable"
  />
</template>
