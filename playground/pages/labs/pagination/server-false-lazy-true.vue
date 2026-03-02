<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <PaginationLab
    :server-option="false"
    execution-mode="lazy"
    page-id="server-false-lazy-true-page"
    title="Paginated: server: false, useConvexPaginatedQueryLazy"
    description="No SSR, non-blocking client navigation with loading state"
    hub-link="/labs/pagination"
  />
</template>
