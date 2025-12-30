<script setup lang="ts">
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
import { useConvexAuth } from '../composables/useConvexAuth'

const { isAuthenticated, isPending } = useConvexAuth()
</script>

<template>
  <slot v-if="!isAuthenticated && !isPending" />
</template>
