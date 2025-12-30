<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for useConvexPaginatedQuery
 *
 * Uses notes.listPaginated query with pagination.
 * Expected behavior:
 * - Initial load shows LoadingFirstPage then CanLoadMore (if more data)
 * - Load More button fetches next page
 * - Real-time updates work per page
 * - Exhausted status when all data loaded
 */

const { results, status, isLoading, loadMore, error } = useConvexPaginatedQuery(
  api.notes.listPaginated,
  {},
  { initialNumItems: 3, verbose: true },
)

const { mutate: addNote, pending: addPending } = useConvexMutation(api.notes.add)
const { mutate: removeNote, pending: removePending } = useConvexMutation(api.notes.remove)

// Track add/remove counts for verification
const addCount = ref(0)
const removeCount = ref(0)
const loadMoreCount = ref(0)

async function handleAdd() {
  const timestamp = Date.now()
  await addNote({
    title: `Paginated Test Note ${timestamp}`,
    content: `Created at ${new Date(timestamp).toISOString()} via E2E test`,
  })
  addCount.value++
}

async function handleRemove(id: string) {
  await removeNote({ id: id as any })
  removeCount.value++
}

function handleLoadMore() {
  loadMore(3)
  loadMoreCount.value++
}
</script>

<template>
  <div data-testid="paginated-query-page" class="test-page">
    <h1>Paginated Query: Notes</h1>
    <p>Test paginated query with Load More functionality.</p>

    <NuxtLink to="/" class="back-link">Back to Home</NuxtLink>

    <section class="control-section">
      <button
        data-testid="add-btn"
        class="action-btn add-btn"
        :disabled="addPending"
        @click="handleAdd"
      >
        {{ addPending ? 'Adding...' : 'Add Note' }}
      </button>

      <button
        data-testid="load-more-btn"
        class="action-btn load-more-btn"
        :disabled="status !== 'CanLoadMore'"
        @click="handleLoadMore"
      >
        {{ isLoading ? 'Loading...' : 'Load More' }}
      </button>
    </section>

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
          <span data-testid="count" class="value">{{ results?.length ?? 0 }}</span>
        </div>
        <div class="state-item">
          <span class="label">adds performed:</span>
          <span data-testid="add-count" class="value">{{ addCount }}</span>
        </div>
        <div class="state-item">
          <span class="label">removes performed:</span>
          <span data-testid="remove-count" class="value">{{ removeCount }}</span>
        </div>
        <div class="state-item">
          <span class="label">load more clicked:</span>
          <span data-testid="load-more-count" class="value">{{ loadMoreCount }}</span>
        </div>
        <div v-if="error" class="state-item error">
          <span class="label">error:</span>
          <span data-testid="error" class="value error-text">{{ error.message }}</span>
        </div>
      </div>
    </section>

    <section class="notes-section">
      <h2>Notes</h2>

      <div v-if="status === 'LoadingFirstPage'" class="loading" data-testid="loading">
        Loading first page...
      </div>

      <div v-else-if="results && results.length === 0" class="empty" data-testid="empty">
        No notes yet. Click "Add Note" to create one.
      </div>

      <ul v-else-if="results" class="notes-list">
        <li
          v-for="note in results"
          :key="note._id"
          class="note-item"
          :data-testid="`note-${note._id}`"
        >
          <div class="note-content">
            <strong class="note-title" :data-testid="`note-title-${note._id}`">
              {{ note.title }}
            </strong>
            <p class="note-body">
              {{ note.content }}
            </p>
          </div>
          <button
            class="delete-btn"
            :data-testid="`delete-${note._id}`"
            :disabled="removePending"
            @click="handleRemove(note._id)"
          >
            Delete
          </button>
        </li>
      </ul>

      <div v-if="status === 'LoadingMore'" class="loading-more" data-testid="loading-more">
        Loading more...
      </div>

      <div v-if="status === 'Exhausted'" class="exhausted" data-testid="exhausted">
        All notes loaded.
      </div>
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

.control-section {
  display: flex;
  gap: 10px;
  margin: 20px 0;
}

.action-btn {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.add-btn {
  background: #4caf50;
  color: white;
}

.add-btn:hover:not(:disabled) {
  background: #45a049;
}

.load-more-btn {
  background: #2196f3;
  color: white;
}

.load-more-btn:hover:not(:disabled) {
  background: #1976d2;
}

.action-btn:disabled {
  background: #9e9e9e;
  cursor: not-allowed;
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

.notes-section {
  margin-top: 20px;
}

.notes-section h2 {
  margin-bottom: 15px;
}

.loading,
.empty,
.loading-more,
.exhausted {
  padding: 20px;
  text-align: center;
  color: #666;
  background: #f8f8f8;
  border-radius: 8px;
}

.exhausted {
  background: #e8f5e9;
  color: #2e7d32;
}

.loading-more {
  margin-top: 10px;
  background: #e3f2fd;
  color: #1565c0;
}

.notes-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.note-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 15px;
  margin: 10px 0;
  background: #f8f8f8;
  border-radius: 8px;
}

.note-content {
  flex: 1;
}

.note-title {
  display: block;
  margin-bottom: 5px;
}

.note-body {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.delete-btn {
  padding: 5px 10px;
  font-size: 14px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.delete-btn:hover:not(:disabled) {
  background: #d32f2f;
}

.delete-btn:disabled {
  background: #9e9e9e;
  cursor: not-allowed;
}
</style>
