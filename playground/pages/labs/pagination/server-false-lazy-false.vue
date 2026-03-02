<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <PaginationLab
    :server-option="false"
    execution-mode="blocking"
    page-id="server-false-lazy-false-page"
    title="Paginated: server: false, await useConvexPaginatedQuery"
    description="No SSR, client navigation blocked until data loads"
    hub-link="/labs/pagination"
  />
</template>
