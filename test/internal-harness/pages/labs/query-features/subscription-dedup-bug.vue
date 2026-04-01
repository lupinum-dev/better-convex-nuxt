<script setup lang="ts">
import {
  emptyQueryArgs,
  getSubscriptionDedupHarness,
  subscriptionDedupCounterQuery,
} from '~~/utils/subscription-dedup-harness'

definePageMeta({
  layout: 'sidebar',
})

const { data: parentData, status: parentStatus } = await useConvexQuery(
  subscriptionDedupCounterQuery,
  emptyQueryArgs,
  { server: false },
)

const childReady = ref(false)
let childReadyTimer: ReturnType<typeof setTimeout> | null = null

const childArgs = computed<Record<string, never> | undefined>(() =>
  childReady.value ? emptyQueryArgs : undefined,
)
const { data: childData, status: childStatus } = await useConvexQuery(
  subscriptionDedupCounterQuery,
  childArgs,
  { server: false },
)

onMounted(() => {
  // Simulates a child component receiving reactive args after mount.
  childReadyTimer = setTimeout(() => {
    childReady.value = true
  }, 50)
})

onUnmounted(() => {
  if (childReadyTimer) {
    clearTimeout(childReadyTimer)
  }
})

function increment() {
  getSubscriptionDedupHarness()?.increment()
}
</script>

<template>
  <div data-testid="subscription-dedup-bug-page" class="test-page">
    <h1>Subscription Deduplication Bug Repro</h1>
    <p class="description">
      Parent subscribes immediately. "Child" starts disabled and resolves later.
    </p>

    <button data-testid="increment-btn" class="action-btn" @click="increment">Increment</button>

    <section class="state-grid">
      <div class="state-item">
        <span class="label">childReady:</span>
        <span data-testid="child-ready" class="value">{{ childReady }}</span>
      </div>

      <div class="state-item">
        <span class="label">parent status:</span>
        <span data-testid="parent-status" class="value">{{ parentStatus }}</span>
      </div>
      <div class="state-item">
        <span class="label">parent count:</span>
        <span data-testid="parent-count" class="value">{{ parentData ?? 'null' }}</span>
      </div>

      <div class="state-item">
        <span class="label">child status:</span>
        <span data-testid="child-status" class="value">{{ childStatus }}</span>
      </div>
      <div class="state-item">
        <span class="label">child count:</span>
        <span data-testid="child-count" class="value">{{ childData ?? 'null' }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 700px;
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
  margin-bottom: 16px;
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
  min-width: 120px;
  color: #6b7280;
  font-weight: 500;
}

.value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 2px 8px;
}
</style>
