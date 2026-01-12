<script setup lang="ts">
interface StateItem {
  label: string
  value: unknown
  testId?: string
}

interface Props {
  title: string
  items: StateItem[]
  testIdPrefix?: string
}

const props = defineProps<Props>()

function getTestId(item: StateItem, _index: number): string | undefined {
  if (item.testId) return item.testId
  if (props.testIdPrefix) {
    return `${props.testIdPrefix}-${item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
  }
  return undefined
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'boolean') return value.toString()
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
</script>

<template>
  <section class="state-section">
    <h2>{{ title }}</h2>
    <div class="state-grid">
      <div v-for="(item, index) in items" :key="item.label" class="state-item">
        <span class="label">{{ item.label }}:</span>
        <span :data-testid="getTestId(item, index)" class="value">{{ formatValue(item.value) }}</span>
      </div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
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
</style>
