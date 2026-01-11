<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for default data option
 *
 * Uses default: () => [] to provide initial placeholder data.
 * Expected behavior:
 * - Initial render shows default value (empty array)
 * - After fetch, shows real data
 * - Default is used before data loads, not as fallback for errors
 */

// Define default data as a constant for comparison
const DEFAULT_DATA = [
  { _id: 'placeholder-1', title: 'Loading...', content: 'Please wait', _creationTime: 0 },
]

const { data, pending, status, error } = useConvexQuery(
  api.notes.list,
  {},
  {
    default: () => DEFAULT_DATA as typeof data.value,
    verbose: true,
  },
)

// Capture initial state at render time
const capturedAtRender = {
  pending: pending.value,
  status: status.value,
  hasData: data.value !== null && data.value !== undefined,
  isDefaultData: JSON.stringify(data.value) === JSON.stringify(DEFAULT_DATA),
  dataLength: Array.isArray(data.value) ? data.value.length : null,
}
</script>

<template>
  <div data-testid="with-default-page" class="test-page">
    <h1>default Data Option</h1>
    <p>Provides placeholder data while loading.</p>

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
        <div class="state-item">
          <span class="label">is default:</span>
          <span
            data-testid="initial-is-default"
            class="value"
            >{{ capturedAtRender.isDefaultData }}</span
          >
        </div>
        <div class="state-item">
          <span class="label">data length:</span>
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
          <span class="label">pending:</span>
          <span data-testid="current-pending" class="value">{{ pending }}</span>
        </div>
        <div class="state-item">
          <span class="label">has data:</span>
          <span data-testid="current-has-data" class="value">{{ data !== null }}</span>
        </div>
        <div class="state-item">
          <span class="label">is default:</span>
          <span data-testid="current-is-default" class="value">
            {{ JSON.stringify(data) === JSON.stringify(DEFAULT_DATA) }}
          </span>
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
          <h3>Before Fetch Completes</h3>
          <ul>
            <li>has data: <code>true</code></li>
            <li>is default: <code>true</code></li>
            <li>Shows placeholder "Loading..." item</li>
          </ul>
        </div>
        <div class="expected-col">
          <h3>After Fetch Completes</h3>
          <ul>
            <li>has data: <code>true</code></li>
            <li>is default: <code>false</code></li>
            <li>Shows real notes from database</li>
          </ul>
        </div>
      </div>
    </section>

    <section v-if="data" class="data-section">
      <h2>Data Preview</h2>
      <ul class="data-list">
        <li
          v-for="item in data"
          :key="item._id"
          class="data-item"
          :data-testid="`item-${item._id}`"
        >
          <strong>{{ item.title }}</strong>
          <span v-if="item._id.startsWith('placeholder')" class="placeholder-badge">
            (placeholder)
          </span>
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

.data-section {
  margin-top: 20px;
}

.data-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
}

.data-item {
  padding: 10px;
  margin: 5px 0;
  background: #f0f0f0;
  border-radius: 4px;
}

.placeholder-badge {
  margin-left: 10px;
  font-size: 12px;
  color: #999;
  font-style: italic;
}
</style>
