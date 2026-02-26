<script setup lang="ts">
import { getSubscriptionDedupHarness } from '~~/utils/subscription-dedup-harness'

definePageMeta({
  layout: 'sidebar',
})

function increment() {
  getSubscriptionDedupHarness()?.increment()
}
</script>

<template>
  <div data-testid="subscription-dedup-transform-page" class="test-page">
    <h1>Subscription Dedup Transform Divergence</h1>
    <p class="description">
      Two subscribers share one subscription, but use different transform outputs.
    </p>

    <button data-testid="increment-btn" class="action-btn" @click="increment">
      Increment
    </button>

    <div class="grid">
      <SubscriptionDedupSubscriber
        prefix="parent"
        label="Parent (raw)"
      />

      <SubscriptionDedupSubscriber
        prefix="child"
        label="Child (delayed + transformed)"
        :delayed="true"
        :delay-ms="50"
        transform-mode="label"
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

.action-btn {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  margin-bottom: 12px;
}

.grid {
  display: grid;
  gap: 10px;
}
</style>
