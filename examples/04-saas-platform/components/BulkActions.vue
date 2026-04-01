<script setup lang="ts">
import { api } from '~/convex/_generated/api'
/**
 * Why this file exists:
 * Bulk operations are where "one-item-at-a-time" demos stop being useful.
 * This keeps the partial-success response visible instead of hiding it behind toasts.
 */
import type { Id } from '~/convex/_generated/dataModel'

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
  <div
    v-if="selectedIds.length"
    class="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border border-default bg-elevated"
  >
    <p class="text-sm text-muted">{{ selectedIds.length }} selected</p>

    <UButton
      data-testid="bulk-complete"
      size="sm"
      :loading="bulkUpdate.pending.value"
      leading-icon="i-lucide-check-check"
      @click="markDone"
    >
      Mark selected as done
    </UButton>

    <p v-if="summary" class="text-sm text-muted">{{ summary }}</p>
  </div>
</template>
