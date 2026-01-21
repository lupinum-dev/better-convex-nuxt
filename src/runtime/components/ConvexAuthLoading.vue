<script setup lang="ts">
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
import { useConvexAuth } from '../composables/useConvexAuth'

const { isPending, authReady } = useConvexAuth()
</script>

<template>
  <slot v-if="isPending || !authReady" />
</template>
