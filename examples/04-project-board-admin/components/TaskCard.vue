<script setup lang="ts">
/**
 * Why this file exists:
 * This is the optimistic update demo. The task card mutates the board immediately, then the
 * realtime query confirms or rolls it back.
 */
import type { Doc, Id } from '~/convex/_generated/dataModel'
import { api } from '~/convex/_generated/api'

type TaskWithCan = Doc<'tasks'> & { _can: Record<string, boolean> }

const props = defineProps<{
  projectId: Id<'projects'>
  task: TaskWithCan
  selected: boolean
}>()

const emit = defineEmits<{
  toggleSelected: [id: Id<'tasks'>]
}>()

function nextStatus() {
  if (props.task.status === 'backlog') return 'in_progress'
  if (props.task.status === 'in_progress') return 'done'
  return 'done'
}

const moveTask = useConvexMutation(api.tasks.moveToColumn, {
  optimisticUpdate: (ctx, args) => {
    ctx.query(api.tasks.listByProject, { projectId: props.projectId }).update(tasks =>
      tasks?.map(task => task._id === args.id ? { ...task, status: args.status } : task) ?? [],
    )
  },
})
</script>

<template>
  <article
    :data-testid="`task-card-${props.task._id}`"
    class="space-y-2 rounded-xl border border-default bg-default p-3"
  >
    <UCheckbox
      :model-value="selected"
      label="Select"
      :ui="{ label: 'text-sm text-muted' }"
      @update:model-value="emit('toggleSelected', props.task._id)"
    />

    <NuxtLink
      class="block font-semibold text-highlighted hover:underline"
      :data-testid="`task-link-${props.task._id}`"
      :to="`/tasks/${props.task._id}?projectId=${props.projectId}`"
    >
      {{ props.task.title }}
    </NuxtLink>

    <p class="text-sm text-muted">
      <UBadge size="xs" variant="subtle" color="neutral">{{ props.task.priority }}</UBadge>
      <span v-if="props.task.assigneeId" class="ml-2">assigned to {{ props.task.assigneeId }}</span>
    </p>

    <UButton
      v-if="props.task._can.update && props.task.status !== 'done'"
      :data-testid="`task-move-${props.task._id}`"
      size="xs"
      variant="soft"
      color="neutral"
      leading-icon="i-lucide-arrow-right"
      @click="moveTask({ id: props.task._id, status: nextStatus() })"
    >
      Move to {{ nextStatus().replace('_', ' ') }}
    </UButton>
  </article>
</template>
