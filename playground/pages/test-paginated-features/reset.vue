<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for reset() method
 *
 * Tests that reset() clears all pages and restarts from the first page.
 */

const { results, status, isLoading, loadMore, reset, error } = await useConvexPaginatedQuery(
  api.notes.listPaginated,
  {},
  { initialNumItems: 3, verbose: true },
)

const resetCount = ref(0)
const loadMoreCount = ref(0)
const isResetting = ref(false)

async function handleReset() {
  isResetting.value = true
  await reset()
  resetCount.value++
  loadMoreCount.value = 0 // Reset the load more count since we're starting fresh
  isResetting.value = false
}

function handleLoadMore() {
  loadMore(3)
  loadMoreCount.value++
}
</script>

<template>
  <div data-testid="paginated-reset-page" class="test-page">
    <h1>Paginated Query: reset()</h1>
    <p>Test that reset() clears all pages and restarts from the first page.</p>

    <NuxtLink to="/" class="back-link">Back to Home</NuxtLink>

    <section class="state-section">
      <h2>Query State</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="status" class="value">{{ status }}</span>
        </div>
        <div class="state-item">
          <span class="label">isLoading:</span>
          <span data-testid="is-loading" class="value">{{ isLoading }}</span>
        </div>
        <div class="state-item">
          <span class="label">result count:</span>
          <span data-testid="count" class="value">{{ results.length }}</span>
        </div>
        <div class="state-item">
          <span class="label">reset count:</span>
          <span data-testid="reset-count" class="value">{{ resetCount }}</span>
        </div>
        <div class="state-item">
          <span class="label">load more count:</span>
          <span data-testid="load-more-count" class="value">{{ loadMoreCount }}</span>
        </div>
        <div v-if="error" class="state-item error">
          <span class="label">error:</span>
          <span data-testid="error" class="value error-text">{{ error.message }}</span>
        </div>
      </div>
    </section>

    <section class="info-section">
      <h2>Test Flow</h2>
      <ol>
        <li>Click "Load More" a few times to load multiple pages</li>
        <li>Note the result count increases</li>
        <li>Click "Reset" - should clear everything and reload first page only</li>
        <li>Result count should be back to initial (3)</li>
      </ol>
    </section>

    <section class="actions-section">
      <button
        data-testid="reset-btn"
        :disabled="isResetting"
        class="reset-btn"
        @click="handleReset"
      >
        {{ isResetting ? 'Resetting...' : 'Reset' }}
      </button>
      <button
        data-testid="load-more-btn"
        :disabled="status !== 'CanLoadMore'"
        class="load-more-btn"
        @click="handleLoadMore"
      >
        Load More
      </button>
    </section>

    <section v-if="results.length > 0" class="data-section">
      <h2>Results ({{ results.length }} items)</h2>
      <ul class="results-list">
        <li v-for="item in results" :key="item._id">
          {{ item.title }}
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.back-link {
  display: inline-block;
  margin-bottom: 20px;
  color: #0066cc;
}

.state-section {
  margin: 20px 0;
  padding: 15px;
  background: #f8f8f8;
  border-radius: 8px;
}

.state-section h2 {
  margin: 0 0 15px;
  font-size: 1.1rem;
}

.state-grid {
  display: grid;
  gap: 8px;
}

.state-item {
  display: flex;
  gap: 10px;
}

.state-item.error {
  color: #d32f2f;
}

.label {
  font-weight: 500;
  min-width: 140px;
}

.value {
  font-family: monospace;
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
}

.error-text {
  background: #ffebee;
}

.info-section {
  margin: 20px 0;
  padding: 15px;
  background: #fff3e0;
  border-radius: 8px;
}

.info-section h2 {
  margin: 0 0 10px;
  font-size: 1rem;
}

.info-section ol {
  margin: 0;
  padding-left: 20px;
}

.info-section li {
  margin: 5px 0;
  font-size: 0.9rem;
}

.actions-section {
  display: flex;
  gap: 10px;
  margin: 20px 0;
}

.actions-section button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: white;
}

.reset-btn {
  background: #f44336;
}

.reset-btn:hover:not(:disabled) {
  background: #d32f2f;
}

.load-more-btn {
  background: #2196f3;
}

.load-more-btn:hover:not(:disabled) {
  background: #1976d2;
}

.actions-section button:disabled {
  background: #9e9e9e;
  cursor: not-allowed;
}

.data-section {
  margin-top: 20px;
}

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.results-list li {
  padding: 10px;
  background: #f8f8f8;
  margin: 5px 0;
  border-radius: 4px;
}
</style>
