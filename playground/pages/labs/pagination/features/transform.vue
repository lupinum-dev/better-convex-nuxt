<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

definePageMeta({
  layout: 'sidebar',
})

/**
 * Test page for transform option
 *
 * Tests that transform is applied to the concatenated results array.
 */

interface TransformedNote {
  _id: string
  title: string
  content: string
  formattedTitle: string
  titleLength: number
}

const { results, status, loadMore } = await useConvexPaginatedQuery(
  api.notes.listPaginated,
  {},
  {
    initialNumItems: 3,
    transform: (items): TransformedNote[] => items.map(item => ({
      _id: item._id,
      title: item.title,
      content: item.content,
      formattedTitle: `[TRANSFORMED] ${item.title.toUpperCase()}`,
      titleLength: item.title.length,
    })),
  },
)
</script>

<template>
  <div data-testid="paginated-transform-page" class="test-page">
    <h1>Paginated Query: transform</h1>
    <p class="description">
      Test that transform is applied to results. Items should have formattedTitle and titleLength
      fields.
    </p>

    <NuxtLink to="/labs/pagination" class="back-link">Back to Pagination Lab</NuxtLink>

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
        <div v-if="results.length > 0" class="state-item">
          <span class="label">has formattedTitle:</span>
          <span data-testid="has-formatted" class="value">{{ 'formattedTitle' in results[0] }}</span>
        </div>
        <div v-if="results.length > 0" class="state-item">
          <span class="label">has titleLength:</span>
          <span data-testid="has-title-length" class="value">{{ 'titleLength' in results[0] }}</span>
        </div>
      </div>
    </section>

    <section class="actions-section">
      <button data-testid="load-more-btn" class="action-btn" :disabled="status !== 'CanLoadMore'" @click="loadMore(3)">
        Load More
      </button>
    </section>

    <section v-if="results.length > 0" class="data-section">
      <h2>Transformed Results</h2>
      <ul class="results-list">
        <li v-for="item in results" :key="item._id">
          <div class="item-title">{{ item.formattedTitle }}</div>
          <div class="item-meta">Original: "{{ item.title }}" | Length: {{ item.titleLength }}</div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 600px;
  margin: 0 auto;
}

.description {
  color: #6b7280;
  margin-bottom: 20px;
}

.back-link {
  display: inline-block;
  margin-bottom: 20px;
  color: #3b82f6;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
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
  color: #374151;
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
  min-width: 140px;
  color: #6b7280;
}

.value {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
  background: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.9rem;
  border: 1px solid #e5e7eb;
}

.actions-section {
  margin: 20px 0;
}

.action-btn {
  padding: 10px 20px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.action-btn:disabled {
  background: #9e9e9e;
  cursor: not-allowed;
}

.data-section {
  margin-top: 20px;
}

.data-section h2 {
  margin: 0 0 10px;
  font-size: 1.1rem;
  color: #374151;
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

.item-title {
  font-weight: 500;
  color: #4caf50;
  margin-bottom: 4px;
}

.item-meta {
  font-size: 0.85rem;
  color: #666;
}
</style>
