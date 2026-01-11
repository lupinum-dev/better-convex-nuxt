<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for server: false (client-only) option
 *
 * Uses server: false to skip SSR data fetching.
 * Expected behavior:
 * - On direct page load (SSR): data is undefined, pending is true
 * - After hydration: data loads via client-side fetch
 * - On client navigation: same as above
 */

const { data, pending, status, error } = useConvexQuery(
  api.notes.list,
  {},
  {
    server: false,
    verbose: true,
  },
)

// Capture initial state at render time
const capturedAtRender = {
  pending: pending.value,
  status: status.value,
  hasData: data.value !== null && data.value !== undefined,
}
</script>

<template>
  <div data-testid="client-only-page" class="test-page">
    <h1>server: false (Client-Only)</h1>
    <p>Query skips SSR and only fetches on the client.</p>

    <NuxtLink to="/test-features/hub" class="back-link">Back to Hub</NuxtLink>

    <section class="state-section">
      <h2>Initial State (captured at render)</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">pending:</span>
          <span data-testid="initial-pending" class="value">{{ capturedAtRender.pending }}</span>
        </div>
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="initial-status" class="value">{{ capturedAtRender.status }}</span>
        </div>
        <div class="state-item">
          <span class="label">has data:</span>
          <span data-testid="initial-has-data" class="value">{{ capturedAtRender.hasData }}</span>
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
          <span class="label">pending:</span>
          <span data-testid="current-pending" class="value">{{ pending }}</span>
        </div>
        <div class="state-item">
          <span class="label">has data:</span>
          <span data-testid="current-has-data" class="value">{{ data !== null }}</span>
        </div>
        <div class="state-item">
          <span class="label">data count:</span>
          <span
            data-testid="current-data-count"
            class="value"
            >{{ Array.isArray(data) ? data.length : 'N/A' }}</span
          >
        </div>
        <div v-if="error" class="state-item">
          <span class="label">error:</span>
          <span data-testid="error" class="value error">{{ error.message }}</span>
        </div>
      </div>
    </section>

    <section class="info-section">
      <h2>Expected Behavior</h2>
      <div class="expected-grid">
        <div class="expected-col">
          <h3>On SSR / Initial Load</h3>
          <ul>
            <li>initial pending: <code>true</code></li>
            <li>initial has data: <code>false</code></li>
          </ul>
        </div>
        <div class="expected-col">
          <h3>After Client Fetch</h3>
          <ul>
            <li>current status: <code>success</code></li>
            <li>current pending: <code>false</code></li>
            <li>current has data: <code>true</code></li>
          </ul>
        </div>
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

.expected-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.expected-col h3 {
  font-size: 0.9rem;
  margin: 0 0 8px;
}

.expected-col ul {
  margin: 0;
  padding-left: 20px;
  font-size: 0.9rem;
}

.info-section code {
  background: #fff;
  padding: 2px 4px;
  border-radius: 3px;
}
</style>
