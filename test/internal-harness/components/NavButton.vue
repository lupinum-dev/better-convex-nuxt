<script setup lang="ts">
interface Props {
  to?: string
  variant?: 'default' | 'primary' | 'success' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  testId?: string
}

const props = withDefaults(defineProps<Props>(), {
  to: undefined,
  variant: 'default',
  size: 'md',
  disabled: false,
  testId: undefined,
})

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const isLink = computed(() => !!props.to)

function handleClick(event: MouseEvent) {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<template>
  <NuxtLink
    v-if="isLink && !disabled"
    :to="to"
    class="nav-btn"
    :class="[`variant-${variant}`, `size-${size}`]"
    :data-testid="testId"
  >
    <slot />
  </NuxtLink>
  <button
    v-else
    type="button"
    class="nav-btn"
    :class="[`variant-${variant}`, `size-${size}`]"
    :disabled="disabled"
    :data-testid="testId"
    @click="handleClick"
  >
    <slot />
  </button>
</template>

<style scoped>
.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 6px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

/* Sizes */
.size-sm {
  padding: 6px 12px;
  font-size: 0.8rem;
}

.size-md {
  padding: 8px 16px;
  font-size: 0.875rem;
}

.size-lg {
  padding: 10px 20px;
  font-size: 1rem;
}

/* Variants */
.variant-default {
  background: white;
  color: #374151;
  border-color: #e5e7eb;
}

.variant-default:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #d1d5db;
}

.variant-primary {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.variant-primary:hover:not(:disabled) {
  background: #2563eb;
  border-color: #2563eb;
}

.variant-success {
  background: #10b981;
  color: white;
  border-color: #10b981;
}

.variant-success:hover:not(:disabled) {
  background: #059669;
  border-color: #059669;
}

.variant-danger {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
}

.variant-danger:hover:not(:disabled) {
  background: #dc2626;
  border-color: #dc2626;
}

/* Disabled */
.nav-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
