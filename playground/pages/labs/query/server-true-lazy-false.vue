<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <QueryLab
    :server-option="true"
    execution-mode="blocking"
    page-id="server-true-lazy-false-page"
    title="server: true, await useConvexQuery"
    description="SSR fetches data, client navigation blocked until data loads"
    hub-link="/labs/query"
  />
</template>
