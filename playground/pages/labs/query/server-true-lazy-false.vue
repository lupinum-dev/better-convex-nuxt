<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <QueryLab
    :server-option="true"
    :lazy-option="false"
    page-id="server-true-lazy-false-page"
    title="server: true, lazy: false"
    description="SSR fetches data, client navigation blocked until data loads (default)"
    hub-link="/labs/query"
  />
</template>
