<script setup lang="ts">
/**
 * Hub page for Reactive Args tests
 *
 * Provides navigation to test pages that verify reactive args behavior.
 */
</script>

<template>
  <div data-testid="args-hub" class="test-hub">
    <h1>Reactive Args Test Hub</h1>
    <p>Test pages for verifying reactive query arguments behavior.</p>

    <nav class="test-nav">
      <NuxtLink to="/test-args/search" data-testid="link-search" class="nav-link">
        Search (reactive query arg)
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
