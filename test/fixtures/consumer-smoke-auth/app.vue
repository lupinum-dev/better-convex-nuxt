<template>
  <div>{{ isAuthenticated ? 'authed' : 'anon' }}</div>
</template>

<script setup lang="ts">
import { useConvexAuth } from '#imports'

const { isAuthenticated } = useConvexAuth()
</script>
