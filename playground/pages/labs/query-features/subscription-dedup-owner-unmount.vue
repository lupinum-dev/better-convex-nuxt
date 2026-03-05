<script setup lang="ts">
import { getSubscriptionDedupHarness } from '~~/utils/subscription-dedup-harness'

definePageMeta({
  layout: 'sidebar',
})

const showParent = ref(true)
const listenerCount = ref<number | null>(null)

function getHarness() {
  return getSubscriptionDedupHarness()
}

function increment() {
  getHarness()?.increment()
  refreshListenerCount()
}

async function unmountParent() {
  showParent.value = false
  await nextTick()
  refreshListenerCount()
}

function refreshListenerCount() {
  listenerCount.value = getHarness()?.getListenerCount?.() ?? null
}

onMounted(() => {
  refreshListenerCount()
  setTimeout(refreshListenerCount, 120)
})
</script>

<template>
  <div data-testid="subscription-dedup-owner-unmount-page" class="test-page">
    <h1>Subscription Dedup Owner Unmount</h1>
    <p class="description">
      Parent subscribes first, child joins later, then parent unmounts. Child should keep updating.
    </p>

    <div class="actions">
      <button data-testid="increment-btn" class="action-btn" @click="increment">Increment</button>
      <button data-testid="unmount-parent-btn" class="action-btn" @click="unmountParent">
        Unmount Parent
      </button>
      <button
        data-testid="refresh-listener-count-btn"
        class="action-btn"
        @click="refreshListenerCount"
      >
        Refresh Listener Count
      </button>
    </div>

    <div class="meta-row">
      <span class="meta-label">showParent:</span>
      <span data-testid="show-parent" class="meta-value">{{ showParent }}</span>
      <span class="meta-label">listeners:</span>
      <span data-testid="listener-count" class="meta-value">{{ listenerCount ?? 'null' }}</span>
    </div>

    <div class="grid">
      <SubscriptionDedupSubscriber v-if="showParent" prefix="parent" label="Parent" />

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

.meta-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.meta-label {
  color: #6b7280;
}

.meta-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 2px 6px;
}

.grid {
  display: grid;
  gap: 10px;
}
</style>
