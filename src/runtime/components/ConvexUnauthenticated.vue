<script lang="ts">
/**
 * Renders slot content only when the user is NOT authenticated.
 * Waits for auth check to complete before rendering.
 *
 * @example
 * ```vue
 * <ConvexUnauthenticated>
 *   <LoginForm />
 * </ConvexUnauthenticated>
 * ```
 */
export default {}
</script>

<script setup lang="ts">
import { useConvexAuth } from '../composables/useConvexAuth'

defineSlots<{
  default(): any
}>()

const { isAuthenticated, isPending } = useConvexAuth()
</script>

<template>
  <slot v-if="!isAuthenticated && !isPending" />
</template>
