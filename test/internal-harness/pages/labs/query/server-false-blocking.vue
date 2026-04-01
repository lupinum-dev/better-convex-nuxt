<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <QueryLab
    :server-option="false"
    page-id="server-false-blocking-page"
    title="server: false, await useConvexQuery"
    description="No SSR fetch, client navigation blocked until data loads"
    hub-link="/labs/query"
  />
</template>
