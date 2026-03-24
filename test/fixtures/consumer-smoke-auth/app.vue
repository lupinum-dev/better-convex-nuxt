<template>
  <div>{{ isAuthenticated ? 'authed' : 'anon' }}</div>
</template>

<script setup lang="ts">
const { isAuthenticated } = useConvexAuth()
</script>
