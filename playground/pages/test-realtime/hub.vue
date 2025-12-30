<script setup lang="ts">
/**
 * Hub page for Real-time Subscription tests
 *
 * Provides navigation to test pages that verify real-time updates.
 */
</script>

<template>
  <div data-testid="realtime-hub" class="test-hub">
    <h1>Real-time Updates Test Hub</h1>
    <p>Test pages for verifying real-time subscription behavior.</p>

    <nav class="test-nav">
      <NuxtLink to="/test-realtime/notes" data-testid="link-notes" class="nav-link">
        Notes (add/delete with real-time updates)
      </NuxtLink>
    </nav>

    <NuxtLink to="/" class="back-link">Back to Home</NuxtLink>
  </div>
</template>

<style scoped>
.test-hub {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.test-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 20px 0;
}

.nav-link {
  display: block;
  padding: 15px;
  background: #f0f0f0;
  border-radius: 8px;
  text-decoration: none;
  color: #333;
}

.nav-link:hover {
  background: #e0e0e0;
}

.back-link {
  display: inline-block;
  margin-top: 20px;
  color: #0066cc;
}
</style>
