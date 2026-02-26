<script lang="ts">
/**
 * Renders slot content only while auth state is being determined.
 * Useful for showing loading spinners during auth check.
 *
 * @example
 * ```vue
 * <ConvexAuthLoading>
 *   <p>Checking authentication...</p>
 * </ConvexAuthLoading>
 * ```
 */
export default {}
</script>

<script setup lang="ts">
import { useConvexAuth } from '../composables/useConvexAuth'

defineSlots<{
  default(): any
}>()

const { isPending } = useConvexAuth()
</script>

<template>
  <slot v-if="isPending" />
</template>
