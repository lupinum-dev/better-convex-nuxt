<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for static skip behavior
 *
 * Uses args: 'skip' to permanently skip the query.
 * Expected behavior:
 * - status = 'idle'
 * - data = null
 * - pending = false
 * - No network requests made
 */

const { data, pending, status, error } = useConvexQuery(
  api.notes.list,
  'skip',
)
</script>

<template>
  <div data-testid="static-skip-page" class="test-page">
    <h1>Static Skip</h1>
    <p>Query is always skipped with args: 'skip'</p>

    <NuxtLink to="/test-skip/hub" class="back-link">Back to Hub</NuxtLink>

    <section class="state-section">
      <h2>Query State</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="status" class="value">{{ status }}</span>
        </div>
        <div class="state-item">
          <span class="label">pending:</span>
          <span data-testid="pending" class="value">{{ pending }}</span>
        </div>
        <div class="state-item">
          <span class="label">data:</span>
          <span
            data-testid="data"
            class="value"
            >{{ data === null ? 'null' : JSON.stringify(data) }}</span
          >
        </div>
        <div class="state-item">
          <span class="label">has data:</span>
          <span data-testid="has-data" class="value">{{ data !== null }}</span>
        </div>
        <div v-if="error" class="state-item">
          <span class="label">error:</span>
          <span data-testid="error" class="value error">{{ error.message }}</span>
        </div>
      </div>
    </section>

    <section class="info-section">
      <h2>Expected Values</h2>
      <ul>
        <li>status: <code>idle</code></li>
        <li>pending: <code>false</code></li>
        <li>data: <code>null</code></li>
        <li>has data: <code>false</code></li>
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
