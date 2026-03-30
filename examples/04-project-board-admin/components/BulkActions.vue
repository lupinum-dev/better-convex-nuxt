<script setup lang="ts">
/**
 * Why this file exists:
 * Bulk operations are where "one-item-at-a-time" demos stop being useful.
 * This keeps the partial-success response visible instead of hiding it behind toasts.
 */
import type { Id } from '~/convex/_generated/dataModel'
import { api } from '~/convex/_generated/api'

const props = defineProps<{
  selectedIds: Id<'tasks'>[]
}>()

const emit = defineEmits<{
  cleared: []
}>()

const bulkUpdate = useConvexMutation(api.tasks.bulkUpdateStatus)
const summary = ref('')

async function markDone() {
  const result = await bulkUpdate({
    ids: props.selectedIds,
    status: 'done',
  })

  summary.value = result.skipped.length
    ? `${result.updated} updated, ${result.skipped.length} skipped.`
    : `Updated ${result.updated} task(s).`

  emit('cleared')
}
</script>

<template>
  <div v-if="selectedIds.length" class="bulk-actions">
    <p class="hint">{{ selectedIds.length }} selected</p>
    <button
      data-testid="bulk-complete"
      class="button"
      type="button"
      :disabled="bulkUpdate.pending.value"
      @click="markDone"
    >
      Mark selected as done
    </button>
    <p v-if="summary" class="hint">{{ summary }}</p>
  </div>
</template>

<style scoped>
.bulk-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.85rem 1rem;
  border: 1px solid #d7e3f2;
  border-radius: 14px;
  background: #f8fbff;
}

.hint {
  margin: 0;
  color: #475467;
}
</style>
