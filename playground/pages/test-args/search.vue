<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for reactive query arguments
 *
 * Uses notes.search with a reactive query argument.
 * Expected behavior:
 * - Typing in the search input should trigger refetch
 * - Results should update to match the search query
 * - Console should log args changes when verbose
 */

const searchQuery = ref('')
const args = computed(() => ({ query: searchQuery.value }))

const { data, pending, status, error } = useConvexQuery(
  api.notes.search,
  args,
  { verbose: true },
)

// Track how many times data has changed (for verifying refetches)
const updateCount = ref(0)
watch(data, () => {
  updateCount.value++
}, { deep: true })
</script>

<template>
  <div data-testid="search-page" class="test-page">
    <h1>Reactive Args: Search</h1>

    <NuxtLink to="/test-args/hub" class="back-link">Back to Hub</NuxtLink>

    <section class="input-section">
      <label for="search-input">Search Notes:</label>
      <input
        id="search-input"
        v-model="searchQuery"
        type="text"
        data-testid="search-input"
        placeholder="Type to search..."
        class="search-input"
      />
    </section>

    <section class="state-section">
      <h2>Query State</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">query:</span>
          <span data-testid="current-query" class="value">{{ searchQuery }}</span>
        </div>
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="status" class="value">{{ status }}</span>
        </div>
        <div class="state-item">
          <span class="label">pending:</span>
          <span data-testid="pending" class="value">{{ pending }}</span>
        </div>
        <div class="state-item">
          <span class="label">result count:</span>
          <span data-testid="result-count" class="value">{{ data?.length ?? 0 }}</span>
        </div>
        <div class="state-item">
          <span class="label">update count:</span>
          <span data-testid="update-count" class="value">{{ updateCount }}</span>
        </div>
        <div v-if="error" class="state-item">
          <span class="label">error:</span>
          <span data-testid="error" class="value error">{{ error.message }}</span>
        </div>
      </div>
    </section>

    <section v-if="data && data.length > 0" class="results-section">
      <h2>Results</h2>
      <ul class="results-list">
        <li
          v-for="note in data"
          :key="note._id"
          :data-testid="`result-${note._id}`"
          class="result-item"
        >
          <strong>{{ note.title }}</strong>
          <p>{{ note.content }}</p>
        </li>
      </ul>
    </section>

    <section v-else-if="data && data.length === 0 && searchQuery" class="no-results">
      <p data-testid="no-results">No notes found matching "{{ searchQuery }}"</p>
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

.input-section {
  margin: 20px 0;
}

.input-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.search-input {
  width: 100%;
  padding: 10px;
  font-size: 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
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

.value.error {
  background: #fee;
  color: #c00;
}

.results-section {
  margin-top: 20px;
}

.results-list {
  list-style: none;
  padding: 0;
}

.result-item {
  padding: 10px;
  margin: 10px 0;
  background: #f0f0f0;
  border-radius: 4px;
}

.result-item strong {
  display: block;
  margin-bottom: 5px;
}

.result-item p {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: #666;
}
</style>
