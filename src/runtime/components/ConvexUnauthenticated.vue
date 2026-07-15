<script setup lang="ts">
/**
 * Renders slot content when auth status is `anonymous` or `disabled`.
 * A Convex-only build renders this branch.
 *
 * @example
 * ```vue
 * <ConvexUnauthenticated>
 *   <LoginForm />
 * </ConvexUnauthenticated>
 * ```
 */
import { useConvexAuth } from '../composables/useConvexAuth'

defineSlots<{
  default(): unknown
}>()

const { status } = useConvexAuth()
</script>

<template>
  <slot v-if="status === 'anonymous' || status === 'disabled'" />
</template>
