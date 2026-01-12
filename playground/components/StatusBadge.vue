<script setup lang="ts">
type StatusType = 'idle' | 'pending' | 'loading' | 'success' | 'error' | 'info'

interface Props {
  status: StatusType | string
  label?: string
  testId?: string
}

const props = defineProps<Props>()

const normalizedStatus = computed<StatusType>(() => {
  const s = props.status.toLowerCase()
  if (s === 'idle' || s === 'pending' || s === 'loading' || s === 'success' || s === 'error' || s === 'info') {
    return s as StatusType
  }
  // Map common variations
  if (s.includes('loading') || s.includes('pending')) return 'loading'
  if (s.includes('success') || s.includes('complete') || s === 'true') return 'success'
  if (s.includes('error') || s.includes('fail') || s === 'false') return 'error'
  return 'info'
})

const displayLabel = computed(() => props.label || props.status)
</script>

<template>
  <span :data-testid="testId" class="status-badge" :class="`status-${normalizedStatus}`">
    {{ displayLabel }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.status-idle {
  background: #f3f4f6;
  color: #6b7280;
}

.status-pending,
.status-loading {
  background: #fef3c7;
  color: #92400e;
}

.status-success {
  background: #d1fae5;
  color: #065f46;
}

.status-error {
  background: #fee2e2;
  color: #991b1b;
}

.status-info {
  background: #dbeafe;
  color: #1e40af;
}
</style>
