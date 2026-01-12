<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <PaginationLab
    :server-option="false"
    :lazy-option="true"
    page-id="server-false-lazy-true-page"
    title="Paginated: server: false, lazy: true"
    description="No SSR, instant client navigation with loading state"
    hub-link="/labs/pagination"
  />
</template>
