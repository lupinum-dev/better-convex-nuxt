<template>
  <div class="container">
    <h1>Guard Custom Redirect</h1>
    <p>Protected route with custom redirect target.</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
  convexAuth: {
    redirectTo: '/auth/signup',
  },
})
</script>
