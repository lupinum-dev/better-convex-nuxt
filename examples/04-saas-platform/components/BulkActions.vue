<script setup lang="ts">
import { api } from '#trellis/api'
/**
 * Why this file exists:
 * Bulk operations are where "one-item-at-a-time" demos stop being useful.
 * The partial-success response surfaces clearly through a toast.
 */
import type { Id } from '~/convex/_generated/dataModel'

const props = defineProps<{
  selectedIds: Id<'tasks'>[]
}>()

const emit = defineEmits<{
  cleared: []
}>()

const toast = useToast()
const bulkUpdate = useConvexMutation(api.tasks.bulkUpdateStatus, {
  onError: (error) => toast.add({ title: 'Bulk update failed', description: error.message, color: 'error' }),
})

async function markDone() {
  const result = await bulkUpdate({
    ids: props.selectedIds,
    status: 'done',
  })

  const message = result.skipped.length
    ? `${result.updated} updated, ${result.skipped.length} skipped.`
    : `Updated ${result.updated} task(s).`

  toast.add({ title: message, color: 'success', icon: 'i-lucide-check-check' })
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
  </div>
</template>
