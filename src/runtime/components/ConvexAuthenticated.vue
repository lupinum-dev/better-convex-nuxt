<script lang="ts">
/**
 * Renders slot content only when the user is authenticated.
 * Waits for auth check to complete before rendering.
 *
 * @example
 * ```vue
 * <ConvexAuthenticated>
 *   <UserDashboard />
 * </ConvexAuthenticated>
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
  <slot v-if="isAuthenticated && !isPending" />
</template>
