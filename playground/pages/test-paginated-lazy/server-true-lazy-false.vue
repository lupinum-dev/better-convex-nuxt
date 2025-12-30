<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page: server: true, lazy: false (default behavior)
 *
 * Expected behavior:
 * - SSR: Fetches data, renders with hasData=true
 * - Client nav: Blocked until data loads
 */

const { results, status, isLoading, loadMore } = await useConvexPaginatedQuery(
  api.notes.listPaginated,
  {},
  { initialNumItems: 3, server: true, lazy: false },
)

// Capture state at script execution time (frozen snapshot)
const capturedAtRender = {
  status: status.value,
  isLoading: isLoading.value,
  hasData: results.value.length > 0,
  dataLength: results.value.length,
}
</script>

<template>
  <div data-testid="server-true-lazy-false-page" class="test-page">
    <h1>Paginated: server: true, lazy: false</h1>
    <p class="description">
      SSR fetches data, client navigation blocked until data loads (default)
    </p>

    <NuxtLink to="/test-paginated-lazy/hub" class="back-link">Back to Hub</NuxtLink>

    <section class="state-section">
      <h2>Initial State (captured at render)</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="initial-status" class="value">{{ capturedAtRender.status }}</span>
        </div>
        <div class="state-item">
          <span class="label">isLoading:</span>
          <span
            data-testid="initial-is-loading"
            class="value"
            >{{ capturedAtRender.isLoading }}</span
          >
        </div>
        <div class="state-item">
          <span class="label">hasData:</span>
          <span data-testid="initial-has-data" class="value">{{ capturedAtRender.hasData }}</span>
        </div>
        <div class="state-item">
          <span class="label">dataLength:</span>
          <span
            data-testid="initial-data-length"
            class="value"
            >{{ capturedAtRender.dataLength }}</span
          >
        </div>
      </div>
    </section>

    <section class="state-section">
      <h2>Current State (reactive)</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="current-status" class="value">{{ status }}</span>
        </div>
        <div class="state-item">
          <span class="label">isLoading:</span>
          <span data-testid="current-is-loading" class="value">{{ isLoading }}</span>
        </div>
        <div class="state-item">
          <span class="label">hasData:</span>
          <span data-testid="current-has-data" class="value">{{ results.length > 0 }}</span>
        </div>
        <div class="state-item">
          <span class="label">dataLength:</span>
          <span data-testid="current-data-length" class="value">{{ results.length }}</span>
        </div>
      </div>
    </section>

    <section class="actions-section">
      <button data-testid="load-more-btn" :disabled="status !== 'CanLoadMore'" @click="loadMore(3)">
        Load More
      </button>
    </section>

    <section v-if="results.length > 0" class="data-section">
      <h2>Data Preview</h2>
      <pre data-testid="data-preview">{{ JSON.stringify(results, null, 2) }}</pre>
    </section>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.description {
  color: #666;
  margin-bottom: 20px;
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

.label {
  font-weight: 500;
  min-width: 100px;
}

.value {
  font-family: monospace;
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
}

.actions-section {
  margin: 20px 0;
}

.actions-section button {
  padding: 10px 20px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.actions-section button:disabled {
  background: #9e9e9e;
  cursor: not-allowed;
}

.data-section {
  margin-top: 20px;
}

.data-section pre {
  background: #f0f0f0;
  padding: 15px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  max-height: 200px;
}
</style>
