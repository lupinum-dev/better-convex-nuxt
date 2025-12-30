<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for multiple queries all with lazy: true
 *
 * All queries: lazy: true
 *
 * Expected behavior:
 * - Navigation is instant (doesn't block)
 * - All initial states show pending
 * - Data loads in background for all queries
 */

// Query A - lazy: true
const queryA = useConvexQuery(api.notes.list, {}, { lazy: true })

// Query B - lazy: true
const queryB = useConvexQuery(api.notes.list, {}, { lazy: true })

// Query C - lazy: true
const queryC = useConvexQuery(api.notes.list, {}, { lazy: true })

// Capture state at script execution time (frozen snapshot)
const capturedAtRender = {
  queryA: {
    pending: queryA.pending.value,
    status: queryA.status.value,
    hasData: queryA.data.value !== null && queryA.data.value !== undefined,
  },
  queryB: {
    pending: queryB.pending.value,
    status: queryB.status.value,
    hasData: queryB.data.value !== null && queryB.data.value !== undefined,
  },
  queryC: {
    pending: queryC.pending.value,
    status: queryC.status.value,
    hasData: queryC.data.value !== null && queryC.data.value !== undefined,
  },
}
</script>

<template>
  <div data-testid="multi-true-page" class="test-page">
    <h1>Multiple Queries - All lazy: true</h1>

    <NuxtLink to="/test-lazy/hub" class="back-link">Back to Hub</NuxtLink>

    <div class="queries-grid">
      <!-- Query A -->
      <section class="query-section">
        <h2>Query A (lazy: true)</h2>
        <div class="state-subsection">
          <h3>Initial State</h3>
          <div class="state-grid">
            <div class="state-item">
              <span class="label">pending:</span>
              <span
                data-testid="a-initial-pending"
                class="value"
                >{{ capturedAtRender.queryA.pending }}</span
              >
            </div>
            <div class="state-item">
              <span class="label">status:</span>
              <span
                data-testid="a-initial-status"
                class="value"
                >{{ capturedAtRender.queryA.status }}</span
              >
            </div>
            <div class="state-item">
              <span class="label">hasData:</span>
              <span
                data-testid="a-initial-has-data"
                class="value"
                >{{ capturedAtRender.queryA.hasData }}</span
              >
            </div>
          </div>
        </div>
        <div class="state-subsection">
          <h3>Current State</h3>
          <div class="state-grid">
            <div class="state-item">
              <span class="label">pending:</span>
              <span data-testid="a-current-pending" class="value">{{ queryA.pending }}</span>
            </div>
            <div class="state-item">
              <span class="label">status:</span>
              <span data-testid="a-current-status" class="value">{{ queryA.status }}</span>
            </div>
            <div class="state-item">
              <span class="label">hasData:</span>
              <span
                data-testid="a-current-has-data"
                class="value"
                >{{ queryA.data !== null && queryA.data !== undefined }}</span
              >
            </div>
          </div>
        </div>
      </section>

      <!-- Query B -->
      <section class="query-section">
        <h2>Query B (lazy: true)</h2>
        <div class="state-subsection">
          <h3>Initial State</h3>
          <div class="state-grid">
            <div class="state-item">
              <span class="label">pending:</span>
              <span
                data-testid="b-initial-pending"
                class="value"
                >{{ capturedAtRender.queryB.pending }}</span
              >
            </div>
            <div class="state-item">
              <span class="label">status:</span>
              <span
                data-testid="b-initial-status"
                class="value"
                >{{ capturedAtRender.queryB.status }}</span
              >
            </div>
            <div class="state-item">
              <span class="label">hasData:</span>
              <span
                data-testid="b-initial-has-data"
                class="value"
                >{{ capturedAtRender.queryB.hasData }}</span
              >
            </div>
          </div>
        </div>
        <div class="state-subsection">
          <h3>Current State</h3>
          <div class="state-grid">
            <div class="state-item">
              <span class="label">pending:</span>
              <span data-testid="b-current-pending" class="value">{{ queryB.pending }}</span>
            </div>
            <div class="state-item">
              <span class="label">status:</span>
              <span data-testid="b-current-status" class="value">{{ queryB.status }}</span>
            </div>
            <div class="state-item">
              <span class="label">hasData:</span>
              <span
                data-testid="b-current-has-data"
                class="value"
                >{{ queryB.data !== null && queryB.data !== undefined }}</span
              >
            </div>
          </div>
        </div>
      </section>

      <!-- Query C -->
      <section class="query-section">
        <h2>Query C (lazy: true)</h2>
        <div class="state-subsection">
          <h3>Initial State</h3>
          <div class="state-grid">
            <div class="state-item">
              <span class="label">pending:</span>
              <span
                data-testid="c-initial-pending"
                class="value"
                >{{ capturedAtRender.queryC.pending }}</span
              >
            </div>
            <div class="state-item">
              <span class="label">status:</span>
              <span
                data-testid="c-initial-status"
                class="value"
                >{{ capturedAtRender.queryC.status }}</span
              >
            </div>
            <div class="state-item">
              <span class="label">hasData:</span>
              <span
                data-testid="c-initial-has-data"
                class="value"
                >{{ capturedAtRender.queryC.hasData }}</span
              >
            </div>
          </div>
        </div>
        <div class="state-subsection">
          <h3>Current State</h3>
          <div class="state-grid">
            <div class="state-item">
              <span class="label">pending:</span>
              <span data-testid="c-current-pending" class="value">{{ queryC.pending }}</span>
            </div>
            <div class="state-item">
              <span class="label">status:</span>
              <span data-testid="c-current-status" class="value">{{ queryC.status }}</span>
            </div>
            <div class="state-item">
              <span class="label">hasData:</span>
              <span
                data-testid="c-current-has-data"
                class="value"
                >{{ queryC.data !== null && queryC.data !== undefined }}</span
              >
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.back-link {
  display: inline-block;
  margin-bottom: 20px;
  color: #0066cc;
}

.queries-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}

.query-section {
  padding: 15px;
  background: #f8f8f8;
  border-radius: 8px;
}

.query-section h2 {
  margin: 0 0 15px;
  font-size: 1rem;
}

.state-subsection {
  margin: 10px 0;
}

.state-subsection h3 {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: #666;
}

.state-grid {
  display: grid;
  gap: 4px;
}

.state-item {
  display: flex;
  gap: 8px;
  font-size: 0.9rem;
}

.label {
  font-weight: 500;
  min-width: 70px;
}

.value {
  font-family: monospace;
  background: #fff;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.85rem;
}
</style>
