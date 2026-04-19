<template>
  <div>{{ isAuthenticated ? 'authed' : 'anon' }}</div>
</template>

<script setup lang="ts">
import { useConvexAuth } from '../../../src/runtime/composables'

const { isAuthenticated } = useConvexAuth()
</script>
