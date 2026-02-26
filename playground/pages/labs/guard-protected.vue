<template>
  <div class="container">
    <h1>Guard Protected</h1>
    <p>If you can see this while logged out, route protection failed.</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
  convexAuth: true,
})
</script>

