<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for reactive skip behavior
 *
 * Uses a computed that returns 'skip' or {} based on toggle.
 * Expected behavior:
 * - When skipped: status = 'idle', data = undefined
 * - When enabled: status = 'success', data = array
 * - Toggling should clear/load data appropriately
 */

const enabled = ref(false)
const args = computed(() => enabled.value ? {} : 'skip')

const { data, pending, status, error } = useConvexQuery(
  api.notes.list,
  args,
  { verbose: true },
)

// Track toggle count for testing
const toggleCount = ref(0)

function toggle() {
  enabled.value = !enabled.value
  toggleCount.value++
}
</script>

<template>
  <div data-testid="reactive-skip-page" class="test-page">
    <h1>Reactive Skip</h1>
    <p>Toggle between skipped and active query states.</p>

    <NuxtLink to="/test-skip/hub" class="back-link">Back to Hub</NuxtLink>

    <section class="control-section">
      <button
        data-testid="toggle-btn"
        class="toggle-btn"
        :class="{ active: enabled }"
        @click="toggle"
      >
        {{ enabled ? 'Disable Query' : 'Enable Query' }}
      </button>
      <span class="toggle-count" data-testid="toggle-count"> Toggled {{ toggleCount }} times </span>
    </section>

    <section class="state-section">
      <h2>Query State</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">enabled:</span>
          <span data-testid="enabled" class="value">{{ enabled }}</span>
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
          <span class="label">has data:</span>
          <span data-testid="has-data" class="value">{{ data !== undefined }}</span>
        </div>
        <div class="state-item">
          <span class="label">data count:</span>
          <span
            data-testid="data-count"
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
      <h2>Expected Values</h2>
      <div class="expected-grid">
        <div class="expected-col">
          <h3>When Disabled (skipped)</h3>
          <ul>
            <li>status: <code>idle</code></li>
            <li>pending: <code>false</code></li>
            <li>has data: <code>false</code></li>
          </ul>
        </div>
        <div class="expected-col">
          <h3>When Enabled (active)</h3>
          <ul>
            <li>status: <code>success</code></li>
            <li>pending: <code>false</code></li>
            <li>has data: <code>true</code></li>
          </ul>
        </div>
      </div>
    </section>

    <section v-if="data && data.length > 0" class="data-section">
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

.back-link {
  display: inline-block;
  margin-bottom: 20px;
  color: #0066cc;
}

.control-section {
  margin: 20px 0;
  display: flex;
  align-items: center;
  gap: 15px;
}

.toggle-btn {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  background: #ddd;
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-btn:hover {
  background: #ccc;
}

.toggle-btn.active {
  background: #4caf50;
  color: white;
}

.toggle-btn.active:hover {
  background: #45a049;
}

.toggle-count {
  font-size: 14px;
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

.data-section pre {
  background: #f0f0f0;
  padding: 15px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  max-height: 200px;
}
</style>
