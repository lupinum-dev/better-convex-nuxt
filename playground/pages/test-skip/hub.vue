<script setup lang="ts">
/**
 * Hub page for Skip Behavior tests
 *
 * Provides navigation to test pages that verify skip behavior.
 */
</script>

<template>
  <div data-testid="skip-hub" class="test-hub">
    <h1>Skip Behavior Test Hub</h1>
    <p>Test pages for verifying query skip behavior with args: 'skip'.</p>

    <nav class="test-nav">
      <NuxtLink to="/test-skip/static-skip" data-testid="link-static-skip" class="nav-link">
        Static Skip (always skipped)
      </NuxtLink>
      <NuxtLink to="/test-skip/reactive-skip" data-testid="link-reactive-skip" class="nav-link">
        Reactive Skip (toggle on/off)
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
