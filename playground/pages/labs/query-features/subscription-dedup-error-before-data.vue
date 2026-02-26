<script setup lang="ts">
import { getSubscriptionDedupHarness } from '~~/utils/subscription-dedup-harness'

definePageMeta({
  layout: 'sidebar',
})

function getHarness() {
  return getSubscriptionDedupHarness()
}

function increment() {
  getHarness()?.increment()
}

function emitError() {
  getHarness()?.emitError?.('Synthetic pre-data error')
}
</script>

<template>
  <div data-testid="subscription-dedup-error-before-data-page" class="test-page">
    <h1>Subscription Dedup Error Before Data</h1>
    <p class="description">
      Fake client does not emit an initial result on this page. We emit an error before first data.
    </p>

    <div class="actions">
      <button data-testid="emit-error-btn" class="action-btn" @click="emitError">
        Emit Error
      </button>
      <button data-testid="increment-btn" class="action-btn" @click="increment">
        Emit First Data (Increment)
      </button>
    </div>

    <div class="grid">
      <SubscriptionDedupSubscriber
        prefix="parent"
        label="Parent"
      />

      <SubscriptionDedupSubscriber
        prefix="child"
        label="Child (delayed args)"
        :delayed="true"
        :delay-ms="50"
      />
    </div>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 860px;
  margin: 0 auto;
}

.description {
  color: #6b7280;
  margin-bottom: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.action-btn {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}

.grid {
  display: grid;
  gap: 10px;
}
</style>
