<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <PaginationLab
    :server-option="true"
    :lazy-option="false"
    page-id="server-true-lazy-false-page"
    title="Paginated: server: true, lazy: false"
    description="SSR fetches data, client navigation blocked until data loads (default)"
    hub-link="/labs/pagination"
  />
</template>
