<script setup lang="ts">
/**
 * Hub page for Query Features tests
 *
 * Provides navigation to test pages for various query features.
 */
</script>

<template>
  <div data-testid="features-hub" class="test-hub">
    <h1>Query Features Test Hub</h1>
    <p>Test pages for various useConvexQuery features.</p>

    <nav class="test-nav">
      <NuxtLink to="/test-features/refresh" data-testid="link-refresh" class="nav-link">
        refresh() method
      </NuxtLink>
      <NuxtLink to="/test-features/client-only" data-testid="link-client-only" class="nav-link">
        server: false (client-only)
      </NuxtLink>
      <NuxtLink to="/test-features/with-default" data-testid="link-with-default" class="nav-link">
        default data
      </NuxtLink>
      <NuxtLink to="/test-features/public-query" data-testid="link-public-query" class="nav-link">
        public: true (skip auth)
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
