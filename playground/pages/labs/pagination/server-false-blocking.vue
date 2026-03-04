<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <PaginationLab
    :server-option="false"
    page-id="server-false-blocking-page"
    title="Paginated: server: false, await useConvexPaginatedQuery"
    description="No SSR, client navigation blocked until data loads"
    hub-link="/labs/pagination"
  />
</template>
