<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page: server: false, lazy: false
 *
 * Expected behavior:
 * - SSR: No fetch, renders with pending=true, hasData=false
 * - Client nav: Blocked until subscription gets data
 * - Uses await to block navigation
 */

const { data, pending, status } = await useConvexQuery(api.notes.list, {}, {
  server: false,
  lazy: false,
})

// Capture state at script execution time (frozen snapshot)
const capturedAtRender = {
  pending: pending.value,
  status: status.value,
  hasData: data.value !== null && data.value !== undefined,
  dataLength: Array.isArray(data.value) ? data.value.length : null,
}
</script>

<template>
  <div data-testid="server-false-lazy-false-page" class="test-page">
    <h1>server: false, lazy: false</h1>
    <p class="description">No SSR fetch, client navigation blocked until data loads</p>

    <NuxtLink to="/test-lazy/hub" class="back-link">Back to Hub</NuxtLink>

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
          <span class="label">hasData:</span>
          <span data-testid="initial-has-data" class="value">{{ capturedAtRender.hasData }}</span>
        </div>
        <div class="state-item">
          <span class="label">dataLength:</span>
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
          <span class="label">pending:</span>
          <span data-testid="current-pending" class="value">{{ pending }}</span>
        </div>
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="current-status" class="value">{{ status }}</span>
        </div>
        <div class="state-item">
          <span class="label">hasData:</span>
          <span
            data-testid="current-has-data"
            class="value"
            >{{ data !== null && data !== undefined }}</span
          >
        </div>
        <div class="state-item">
          <span class="label">dataLength:</span>
          <span
            data-testid="current-data-length"
            class="value"
            >{{ Array.isArray(data) ? data.length : null }}</span
          >
        </div>
      </div>
    </section>

    <section v-if="data" class="data-section">
      <h2>Data Preview</h2>
      <pre data-testid="data-preview">{{ JSON.stringify(data, null, 2) }}</pre>
    </section>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.description {
  color: #666;
  margin-bottom: 20px;
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

.data-section {
  margin-top: 20px;
}

.data-section pre {
  background: #f0f0f0;
  padding: 15px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  max-height: 200px;
}
</style>
