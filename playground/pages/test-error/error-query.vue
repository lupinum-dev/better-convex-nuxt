<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for error handling
 *
 * Uses testing.alwaysFails query that intentionally throws an error.
 * Expected behavior:
 * - status = 'error'
 * - error contains error message
 * - data = undefined
 * - refresh() retries the query (still fails)
 */

const { data, pending, status, error, refresh } = useConvexQuery(
  api.testing.alwaysFails,
  {},
  { verbose: true },
)

// Track retry count
const retryCount = ref(0)

async function handleRetry() {
  retryCount.value++
  await refresh()
}
</script>

<template>
  <div data-testid="error-page" class="test-page">
    <h1>Error Query</h1>
    <p>Tests error handling with a query that always fails.</p>

    <NuxtLink to="/test-error/hub" class="back-link">Back to Hub</NuxtLink>

    <section class="state-section">
      <h2>Query State</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="status" class="value" :class="{ error: status === 'error' }">
            {{ status }}
          </span>
        </div>
        <div class="state-item">
          <span class="label">pending:</span>
          <span data-testid="pending" class="value">{{ pending }}</span>
        </div>
        <div class="state-item">
          <span class="label">has error:</span>
          <span data-testid="has-error" class="value">{{ error !== null }}</span>
        </div>
        <div class="state-item">
          <span class="label">has data:</span>
          <span data-testid="has-data" class="value">{{ data !== undefined }}</span>
        </div>
        <div class="state-item">
          <span class="label">retry count:</span>
          <span data-testid="retry-count" class="value">{{ retryCount }}</span>
        </div>
      </div>
    </section>

    <section v-if="error" class="error-section">
      <h2>Error Details</h2>
      <div class="error-box">
        <span class="error-label">Message:</span>
        <span data-testid="error-message" class="error-message">
          {{ error.message }}
        </span>
      </div>
    </section>

    <section class="action-section">
      <button data-testid="retry-btn" class="retry-btn" :disabled="pending" @click="handleRetry">
        {{ pending ? 'Retrying...' : 'Retry Query' }}
      </button>
    </section>

    <section class="info-section">
      <h2>Expected Values</h2>
      <ul>
        <li>status: <code>error</code></li>
        <li>pending: <code>false</code></li>
        <li>has error: <code>true</code></li>
        <li>has data: <code>false</code></li>
        <li>error message: Contains "Intentional test error"</li>
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
  min-width: 100px;
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

.error-section {
  margin: 20px 0;
  padding: 15px;
  background: #fee;
  border-radius: 8px;
  border: 1px solid #fcc;
}

.error-section h2 {
  margin: 0 0 10px;
  font-size: 1rem;
  color: #c00;
}

.error-box {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.error-label {
  font-weight: 500;
  color: #900;
}

.error-message {
  font-family: monospace;
  color: #c00;
  word-break: break-word;
}

.action-section {
  margin: 20px 0;
}

.retry-btn {
  padding: 10px 20px;
  font-size: 16px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.retry-btn:hover:not(:disabled) {
  background: #1976d2;
}

.retry-btn:disabled {
  background: #9e9e9e;
  cursor: not-allowed;
}

.info-section {
  margin-top: 20px;
  padding: 15px;
  background: #e8f4ff;
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

.info-section code {
  background: #fff;
  padding: 2px 4px;
  border-radius: 3px;
}
</style>
