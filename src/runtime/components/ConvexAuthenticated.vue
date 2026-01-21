<script setup lang="ts">
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
import { useConvexAuth } from '../composables/useConvexAuth'

const { isAuthenticated, isPending, authReady } = useConvexAuth()
</script>

<template>
  <slot v-if="authReady && isAuthenticated && !isPending" />
</template>
