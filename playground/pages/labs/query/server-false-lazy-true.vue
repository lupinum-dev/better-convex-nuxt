<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <QueryLab
    :server-option="false"
    :lazy-option="true"
    page-id="server-false-lazy-true-page"
    title="server: false, lazy: true"
    description="No SSR fetch, instant client navigation"
    hub-link="/labs/query"
  />
</template>
