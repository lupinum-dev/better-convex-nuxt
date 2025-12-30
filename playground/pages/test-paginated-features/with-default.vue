<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for default option
 *
 * Tests that default value is used while loading first page.
 */

const placeholderItems = [
  { _id: 'placeholder-1', title: 'Loading...', content: 'Please wait', createdAt: 0 },
  { _id: 'placeholder-2', title: 'Loading...', content: 'Please wait', createdAt: 0 },
  { _id: 'placeholder-3', title: 'Loading...', content: 'Please wait', createdAt: 0 },
]

const { results, status, loadMore } = await useConvexPaginatedQuery(
  api.notes.listPaginated,
  {},
  {
    initialNumItems: 3,
    // Use server: false to force client-side loading so we can see the default
    server: false,
    lazy: true,
    default: () => placeholderItems,
  },
)

// Track if we ever saw the default value
const sawDefault = ref(false)
watch(results, (newResults) => {
  if (newResults.some(r => r._id.startsWith('placeholder'))) {
    sawDefault.value = true
  }
}, { immediate: true })
</script>

<template>
  <div data-testid="paginated-default-page" class="test-page">
    <h1>Paginated Query: default</h1>
    <p>Test that default value is used while loading. Reload the page to see placeholders.</p>

    <NuxtLink to="/" class="back-link">Back to Home</NuxtLink>

    <section class="state-section">
      <h2>Query State</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="status" class="value">{{ status }}</span>
        </div>
        <div class="state-item">
          <span class="label">result count:</span>
          <span data-testid="count" class="value">{{ results.length }}</span>
        </div>
        <div class="state-item">
          <span class="label">saw default:</span>
          <span data-testid="saw-default" class="value">{{ sawDefault }}</span>
        </div>
        <div class="state-item">
          <span class="label">is placeholder:</span>
          <span
            data-testid="is-placeholder"
            class="value"
            >{{ results.length > 0 && results[0]._id.startsWith('placeholder') }}</span
          >
        </div>
      </div>
    </section>

    <section class="actions-section">
      <button data-testid="load-more-btn" :disabled="status !== 'CanLoadMore'" @click="loadMore(3)">
        Load More
      </button>
    </section>

    <section v-if="results.length > 0" class="data-section">
      <h2>Results</h2>
      <ul class="results-list">
        <li
          v-for="item in results"
          :key="item._id"
          :class="{ placeholder: item._id.startsWith('placeholder') }"
        >
          <div class="item-title">{{ item.title }}</div>
          <div class="item-id">ID: {{ item._id }}</div>
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

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.results-list li {
  padding: 12px;
  background: #f8f8f8;
  margin: 8px 0;
  border-radius: 4px;
}

.results-list li.placeholder {
  background: #fff3e0;
  border: 1px dashed #ff9800;
}

.item-title {
  font-weight: 500;
  margin-bottom: 4px;
}

.item-id {
  font-size: 0.8rem;
  color: #666;
  font-family: monospace;
}
</style>
