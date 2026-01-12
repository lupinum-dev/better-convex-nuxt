<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <PaginationLab
    :server-option="false"
    :lazy-option="false"
    page-id="server-false-lazy-false-page"
    title="Paginated: server: false, lazy: false"
    description="No SSR, client navigation blocked until data loads"
    hub-link="/labs/pagination"
  />
</template>
