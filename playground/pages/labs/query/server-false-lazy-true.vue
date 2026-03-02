<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <QueryLab
    :server-option="false"
    execution-mode="lazy"
    page-id="server-false-lazy-true-page"
    title="server: false, useConvexQueryLazy"
    description="No SSR fetch, non-blocking client navigation"
    hub-link="/labs/query"
  />
</template>
