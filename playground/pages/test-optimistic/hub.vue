<script setup lang="ts">
/**
 * Hub page for optimistic update tests
 */
</script>

<template>
  <div data-testid="optimistic-hub" class="test-hub">
    <h1>Optimistic Updates Test Hub</h1>
    <p>Test pages for verifying optimistic update behavior.</p>

    <nav class="nav-links">
      <NuxtLink to="/test-optimistic/notes" data-testid="link-notes" class="nav-link">
        Notes with Optimistic Updates
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

.nav-links {
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
  color: #333;
  text-decoration: none;
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
