<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <PaginationLab
    :server-option="true"
    execution-mode="lazy"
    page-id="server-true-lazy-true-page"
    title="Paginated: server: true, useConvexPaginatedQueryLazy"
    description="SSR fetches data, non-blocking client navigation (recommended)"
    hub-link="/labs/pagination"
  />
</template>
