<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

interface Props {
  serverOption: boolean
  lazyOption: boolean
  pageId: string
  title: string
  description: string
  hubLink?: string
}

const props = withDefaults(defineProps<Props>(), {
  hubLink: '/labs/query',
})

// Always await - useConvexQuery internally handles server/lazy behavior
// The await ensures Nuxt can properly block navigation when lazy: false
const { data, pending, status } = await useConvexQuery(api.notes.list, {}, {
  server: props.serverOption,
  lazy: props.lazyOption,
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
  <div :data-testid="pageId" class="test-page">
    <h1>{{ title }}</h1>
    <p class="description">{{ description }}</p>

    <NuxtLink :to="hubLink" class="back-link">Back to Hub</NuxtLink>

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
          <span data-testid="initial-data-length" class="value">{{ capturedAtRender.dataLength }}</span>
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
          <span data-testid="current-has-data" class="value">{{ data !== null && data !== undefined }}</span>
        </div>
        <div class="state-item">
          <span class="label">dataLength:</span>
          <span data-testid="current-data-length" class="value">{{ Array.isArray(data) ? data.length : null }}</span>
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
  color: #3b82f6;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
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
  color: #374151;
}

.state-grid {
  display: grid;
  gap: 8px;
}

.state-item {
  display: flex;
  gap: 10px;
  align-items: center;
}

.label {
  font-weight: 500;
  min-width: 100px;
  color: #6b7280;
}

.value {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
  background: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.9rem;
  border: 1px solid #e5e7eb;
}

.data-section {
  margin-top: 20px;
}

.data-section h2 {
  margin: 0 0 10px;
  font-size: 1.1rem;
  color: #374151;
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
