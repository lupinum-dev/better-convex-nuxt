<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <QueryLab
    :server-option="false"
    :lazy-option="false"
    page-id="server-false-lazy-false-page"
    title="server: false, lazy: false"
    description="No SSR fetch, client navigation blocked until data loads"
    hub-link="/labs/query"
  />
</template>
