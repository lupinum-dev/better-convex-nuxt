<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <PaginationLab
    :server-option="true"
    execution-mode="blocking"
    page-id="server-true-lazy-false-page"
    title="Paginated: server: true, await useConvexPaginatedQuery"
    description="SSR fetches data, client navigation blocked until data loads"
    hub-link="/labs/pagination"
  />
</template>
