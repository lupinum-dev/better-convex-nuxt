<script setup lang="ts">
/**
 * Renders slot content only when auth status is `loading` (vNext §4.2).
 *
 * @example
 * ```vue
 * <ConvexAuthLoading>
 *   <p>Checking authentication...</p>
 * </ConvexAuthLoading>
 * ```
 */
import { useConvexAuth } from '../composables/useConvexAuth'

defineSlots<{
  default(): unknown
}>()

const { status } = useConvexAuth()
</script>

<template>
  <slot v-if="status === 'loading'" />
</template>
