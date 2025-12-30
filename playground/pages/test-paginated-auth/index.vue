<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for useConvexPaginatedQuery with AUTHENTICATION
 *
 * Uses posts.listPaginated query which requires auth.
 * Expected behavior:
 * - If not logged in: empty results, status 'Exhausted'
 * - If logged in: SSR fetches data with auth token, shows org's posts
 * - Real-time updates work per page
 * - Load More button fetches next page
 */

// Get auth state
const { isAuthenticated, isLoading: authLoading } = useConvexAuth()

// Paginated query for posts (auth-protected)
const { results, status, isLoading, loadMore, error } = useConvexPaginatedQuery(
  api.posts.listPaginated,
  {},
  { initialNumItems: 3, verbose: true },
)

// Mutations for testing
const { mutate: createPost, pending: createPending } = useConvexMutation(api.posts.create)
const { mutate: removePost, pending: removePending } = useConvexMutation(api.posts.remove)

// Track counts for verification
const addCount = ref(0)
const removeCount = ref(0)
const loadMoreCount = ref(0)

async function handleAdd() {
  const timestamp = Date.now()
  await createPost({
    title: `Auth Test Post ${timestamp}`,
    content: `Created at ${new Date(timestamp).toISOString()} - SSR auth test`,
  })
  addCount.value++
}

async function handleRemove(id: string) {
  await removePost({ id: id as any })
  removeCount.value++
}

function handleLoadMore() {
  loadMore(3)
  loadMoreCount.value++
}

// SSR info for debugging - use computed to get current values
const ssrInfo = computed(() => ({
  // This will be 'server' if we're on server, 'client' otherwise
  environment: import.meta.server ? 'server' : 'client',
  // Current result count (reflects hydrated data on client)
  resultCount: results.value?.length ?? 0,
  // Current status
  currentStatus: status.value,
}))
</script>

<template>
  <div data-testid="paginated-auth-page" class="test-page">
    <h1>Paginated Query: Auth-Protected Posts</h1>
    <p>Test paginated query with authentication (SSR with auth token).</p>

    <NuxtLink to="/" class="back-link"> Back to Home </NuxtLink>

    <section class="auth-section">
      <h2>Auth Status</h2>
      <div class="auth-grid">
        <div class="auth-item">
          <span class="label">authenticated:</span>
          <span
            data-testid="auth-status"
            class="value"
            :class="{ success: isAuthenticated, warning: !isAuthenticated }"
          >
            {{ authLoading ? 'loading...' : isAuthenticated }}
          </span>
        </div>
        <div class="auth-item">
          <span class="label">environment:</span>
          <ClientOnly>
            <span data-testid="environment" class="value">
              {{ ssrInfo.environment }}
            </span>
            <template #fallback>
              <span class="value">server</span>
            </template>
          </ClientOnly>
        </div>
        <div class="auth-item">
          <span class="label">result count:</span>
          <span data-testid="result-count" class="value">
            {{ ssrInfo.resultCount }}
          </span>
        </div>
        <div class="auth-item">
          <span class="label">current status:</span>
          <span data-testid="current-status" class="value">
            {{ ssrInfo.currentStatus }}
          </span>
        </div>
      </div>

      <div v-if="!isAuthenticated && !authLoading" class="auth-warning">
        Please log in to see your organization's posts.
        <NuxtLink to="/playground"> Go to Playground to log in </NuxtLink>
      </div>
    </section>

    <section class="control-section">
      <button
        data-testid="add-btn"
        class="action-btn add-btn"
        :disabled="createPending || !isAuthenticated"
        @click="handleAdd"
      >
        {{ createPending ? 'Adding...' : 'Add Post' }}
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

    <section class="posts-section">
      <h2>Posts</h2>

      <div v-if="status === 'LoadingFirstPage'" class="loading" data-testid="loading">
        Loading first page...
      </div>

      <div v-else-if="results && results.length === 0" class="empty" data-testid="empty">
        {{ isAuthenticated ? 'No posts yet. Click "Add Post" to create one.' : 'Please log in to see posts.' }}
      </div>

      <ul v-else-if="results" class="posts-list">
        <li
          v-for="post in results"
          :key="post._id"
          class="post-item"
          :data-testid="`post-${post._id}`"
        >
          <div class="post-content">
            <strong class="post-title" :data-testid="`post-title-${post._id}`">
              {{ post.title }}
            </strong>
            <p class="post-body">
              {{ post.content }}
            </p>
            <span class="post-meta">
              Status: {{ post.status }} | Created:
              {{ new Date(post.createdAt).toISOString().slice(0, 19).replace('T', ' ') }}
            </span>
          </div>
          <button
            class="delete-btn"
            :data-testid="`delete-${post._id}`"
            :disabled="removePending"
            @click="handleRemove(post._id)"
          >
            Delete
          </button>
        </li>
      </ul>

      <div v-if="status === 'LoadingMore'" class="loading-more" data-testid="loading-more">
        Loading more...
      </div>

      <div v-if="status === 'Exhausted'" class="exhausted" data-testid="exhausted">
        All posts loaded.
      </div>
    </section>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 700px;
  margin: 0 auto;
  padding: 20px;
}

.back-link {
  display: inline-block;
  margin-bottom: 20px;
  color: #0066cc;
}

.auth-section {
  margin: 20px 0;
  padding: 15px;
  background: #e3f2fd;
  border-radius: 8px;
  border: 1px solid #90caf9;
}

.auth-section h2 {
  margin: 0 0 15px;
  font-size: 1.1rem;
  color: #1565c0;
}

.auth-grid {
  display: grid;
  gap: 8px;
}

.auth-item {
  display: flex;
  gap: 10px;
}

.auth-warning {
  margin-top: 15px;
  padding: 10px;
  background: #fff3e0;
  border-radius: 4px;
  color: #e65100;
}

.auth-warning a {
  color: #1565c0;
  margin-left: 10px;
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

.value.success {
  background: #e8f5e9;
  color: #2e7d32;
}

.value.warning {
  background: #fff3e0;
  color: #e65100;
}

.error-text {
  background: #ffebee;
}

.posts-section {
  margin-top: 20px;
}

.posts-section h2 {
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

.posts-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.post-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 15px;
  margin: 10px 0;
  background: #f8f8f8;
  border-radius: 8px;
}

.post-content {
  flex: 1;
}

.post-title {
  display: block;
  margin-bottom: 5px;
}

.post-body {
  margin: 0 0 8px;
  font-size: 14px;
  color: #666;
}

.post-meta {
  font-size: 12px;
  color: #999;
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
