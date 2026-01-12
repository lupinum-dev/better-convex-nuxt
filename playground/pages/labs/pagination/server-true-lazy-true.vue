<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <PaginationLab
    :server-option="true"
    :lazy-option="true"
    page-id="server-true-lazy-true-page"
    title="Paginated: server: true, lazy: true"
    description="SSR fetches data, instant client navigation (best of both worlds)"
    hub-link="/labs/pagination"
  />
</template>
