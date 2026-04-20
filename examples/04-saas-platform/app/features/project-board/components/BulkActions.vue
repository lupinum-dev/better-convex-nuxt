<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#trellis/api'

const props = defineProps<{
  selectedIds: Id<'tasks'>[]
}>()

const emit = defineEmits<{
  cleared: []
}>()

const toast = useToast()
const bulkUpdate = useConvexMutation(api.features.tasks.domain.bulkUpdateStatus, {
  onError: (error) =>
    toast.add({ title: 'Bulk update failed', description: error.message, color: 'error' }),
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
