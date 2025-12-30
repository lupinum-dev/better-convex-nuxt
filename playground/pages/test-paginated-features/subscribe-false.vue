<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for subscribe: false option
 *
 * Tests that subscribe: false skips WebSocket subscriptions
 * and data only comes from SSR + manual refresh().
 */

const { results, status, isLoading, loadMore, refresh, error } = await useConvexPaginatedQuery(
  api.notes.listPaginated,
  {},
  {
    initialNumItems: 3,
    subscribe: false,
    verbose: true,
  },
)

const refreshCount = ref(0)
const isRefreshing = ref(false)

async function handleRefresh() {
  isRefreshing.value = true
  await refresh()
  refreshCount.value++
  isRefreshing.value = false
}
</script>

<template>
  <div data-testid="paginated-subscribe-false-page" class="test-page">
    <h1>Paginated Query: subscribe: false</h1>
    <p>
      Real-time updates are disabled. Data only comes from SSR and manual refresh(). Open console to
      verify no WebSocket subscriptions are created.
    </p>

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
          <span class="label">refresh count:</span>
          <span data-testid="refresh-count" class="value">{{ refreshCount }}</span>
        </div>
        <div v-if="error" class="state-item error">
          <span class="label">error:</span>
          <span data-testid="error" class="value error-text">{{ error.message }}</span>
        </div>
      </div>
    </section>

    <section class="info-section">
      <h2>Behavior Notes</h2>
      <ul>
        <li>No WebSocket subscriptions are created</li>
        <li>Data won't update automatically when server data changes</li>
        <li>Use refresh() to manually re-fetch data</li>
        <li>Good for static/archive pages where real-time isn't needed</li>
      </ul>
    </section>

    <section class="actions-section">
      <button data-testid="refresh-btn" :disabled="isRefreshing" @click="handleRefresh">
        {{ isRefreshing ? 'Refreshing...' : 'Manual Refresh' }}
      </button>
      <button data-testid="load-more-btn" :disabled="status !== 'CanLoadMore'" @click="loadMore(3)">
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
  min-width: 120px;
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
  background: #e3f2fd;
  border-radius: 8px;
}

.info-section h2 {
  margin: 0 0 10px;
  font-size: 1rem;
}

.info-section ul {
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

.actions-section button:first-child {
  background: #ff9800;
}

.actions-section button:first-child:hover:not(:disabled) {
  background: #f57c00;
}

.actions-section button:last-child {
  background: #2196f3;
}

.actions-section button:last-child:hover:not(:disabled) {
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
