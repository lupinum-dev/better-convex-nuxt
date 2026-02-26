<template>
  <div class="container" data-testid="guard-pending-protected-page">
    <h1>Guard Pending Protected</h1>
    <p>If this page mounts while logged out and auth is pending, middleware protection regressed.</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
  convexAuth: true,
})

if (import.meta.client) {
  const win = window as Window & { __BCN_PENDING_GUARD_PROTECTED_MOUNTED__?: number }
  win.__BCN_PENDING_GUARD_PROTECTED_MOUNTED__ = (win.__BCN_PENDING_GUARD_PROTECTED_MOUNTED__ ?? 0) + 1
}
</script>
