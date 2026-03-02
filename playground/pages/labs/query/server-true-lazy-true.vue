<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <QueryLab
    :server-option="true"
    execution-mode="lazy"
    page-id="server-true-lazy-true-page"
    title="server: true, useConvexQueryLazy"
    description="SSR fetches data, non-blocking client navigation (recommended)"
    hub-link="/labs/query"
  />
</template>
