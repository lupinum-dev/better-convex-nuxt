<script setup lang="ts">
/**
 * Renders slot content only when auth status is `error` (vNext §4.2): initial
 * auth resolution failed without a usable identity (e.g. 401/403 at token
 * exchange, or a token that decoded to no user).
 *
 * @example
 * ```vue
 * <ConvexAuthError v-slot="{ retry, error }">
 *   <ErrorCard :message="error || 'Session expired'" :onRetry="retry" />
 * </ConvexAuthError>
 * ```
 */
import { useConvexAuth } from '../composables/useConvexAuth'

defineSlots<{
  default(props: { retry: () => void; error: string | null }): unknown
}>()

const { status, authError } = useConvexAuth()

/** Retry authentication by reloading the page. */
function retry() {
  window.location.reload()
}
</script>

<template>
  <slot v-if="status === 'error'" :retry="retry" :error="authError" />
</template>
