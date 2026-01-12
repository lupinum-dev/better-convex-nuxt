<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for DEEP reactive query arguments
 *
 * This tests that when a nested property inside a ref object changes,
 * the query re-fetches (not just when the ref identity changes).
 *
 * Expected behavior:
 * - Clicking "Change Filter" should modify args.value.query (deep mutation)
 * - Query should re-fetch with new args
 * - Update count should increment
 */

// Use ref with object - deep changes should trigger refetch
const args = ref<{ query: string }>({ query: '' })

const { data, pending, status } = useConvexQuery(
  api.notes.search,
  args,
)

// Track refetch count
const updateCount = ref(0)
watch(data, () => {
  updateCount.value++
}, { deep: true })

// Deep mutation - changes args.value.query without changing args ref identity
function changeFilter(newQuery: string) {
  args.value.query = newQuery
}

// For comparison - this would always work (ref identity changes)
function replaceArgs(newQuery: string) {
  args.value = { query: newQuery }
}

const testQueries = ['hello', 'test', 'note', '']
const currentQueryIndex = ref(0)

function cycleDeepMutation() {
  currentQueryIndex.value = (currentQueryIndex.value + 1) % testQueries.length
  changeFilter(testQueries[currentQueryIndex.value]!)
}

function cycleRefReplace() {
  currentQueryIndex.value = (currentQueryIndex.value + 1) % testQueries.length
  replaceArgs(testQueries[currentQueryIndex.value]!)
}
</script>

<template>
  <div data-testid="deep-reactive-page" class="test-page">
    <h1>Deep Reactive Args Test</h1>

    <NuxtLink to="/test-args/hub" class="back-link">Back to Hub</NuxtLink>

    <section class="actions-section">
      <h2>Test Actions</h2>
      <div class="button-group">
        <button
          data-testid="deep-mutation-btn"
          class="btn"
          @click="cycleDeepMutation"
        >
          Deep Mutation (args.value.query = ...)
        </button>
        <button
          data-testid="ref-replace-btn"
          class="btn btn-secondary"
          @click="cycleRefReplace"
        >
          Ref Replace (args.value = {...})
        </button>
      </div>
      <p class="hint">
        Deep mutation modifies a nested property. This should trigger refetch.
      </p>
    </section>

    <section class="state-section">
      <h2>Query State</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">args.value.query:</span>
          <span data-testid="current-query" class="value">"{{ args.query }}"</span>
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
      </div>
    </section>

    <section v-if="data && data.length > 0" class="results-section">
      <h2>Results</h2>
      <ul class="results-list">
        <li
          v-for="note in data"
          :key="note._id"
          class="result-item"
        >
          <strong>{{ note.title }}</strong>
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

.actions-section {
  margin: 20px 0;
  padding: 15px;
  background: #e8f4ff;
  border-radius: 8px;
}

.actions-section h2 {
  margin: 0 0 15px;
  font-size: 1.1rem;
}

.button-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #0066cc;
  color: white;
}

.btn:hover {
  background: #0052a3;
}

.btn-secondary {
  background: #666;
}

.btn-secondary:hover {
  background: #444;
}

.hint {
  margin-top: 10px;
  font-size: 13px;
  color: #666;
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
  min-width: 140px;
}

.value {
  font-family: monospace;
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
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
</style>
