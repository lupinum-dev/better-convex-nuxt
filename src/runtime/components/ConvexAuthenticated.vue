<script setup lang="ts">
/**
 * Renders slot content only when auth status is `authenticated` (vNext §4.2).
 *
 * @example
 * ```vue
 * <ConvexAuthenticated>
 *   <UserDashboard />
 * </ConvexAuthenticated>
 * ```
 */
import { useConvexAuth } from '../composables/useConvexAuth'

defineSlots<{
  default(): unknown
}>()

const { status } = useConvexAuth()
</script>

<template>
  <slot v-if="status === 'authenticated'" />
</template>
