<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#trellis/api'

import type { BoardTask } from '../types/board-task'

const props = defineProps<{
  projectId: Id<'projects'>
  task: BoardTask
  selected: boolean
  memberNames?: Map<string, string>
}>()

const emit = defineEmits<{
  toggleSelected: [id: Id<'tasks'>]
}>()

const toast = useToast()
const convex = useConvex()

const priorityColor = computed(() => {
  if (props.task.priority === 'high') return 'error'
  if (props.task.priority === 'medium') return 'warning'
  return 'neutral'
})

function nextStatus() {
  if (props.task.status === 'backlog') return 'in_progress'
  if (props.task.status === 'in_progress') return 'done'
  return 'done'
}

function resolveName(userId: string) {
  return props.memberNames?.get(userId) ?? `Member ${userId.slice(0, 8)}…`
}

const moveTask = useConvexMutation(api.features.tasks.domain.moveToColumn, {
  optimisticUpdate: (ctx, args) => {
    ctx
      .query(api.features.tasks.domain.listByProject, { projectId: props.projectId })
      .update(
        (tasks) =>
          tasks?.map((task: BoardTask) =>
            task._id === args.id ? { ...task, status: args.status } : task,
          ) ?? [],
      )
  },
  onError: (error) =>
    toast.add({ title: 'Could not move task', description: error.message, color: 'error' }),
})

const deleteTask = useConvexMutation(api.features.tasks.domain.remove, {
  onSuccess: () => toast.add({ title: 'Task deleted', color: 'success', icon: 'i-lucide-trash-2' }),
  onError: (error) =>
    toast.add({ title: 'Could not delete task', description: error.message, color: 'error' }),
})

async function handleDeleteTask() {
  const preview = await convex.mutation(api.features.tasks.operations.previewRemoveTask, {
    id: props.task._id,
  })
  const token = preview.confirmation?.token
  if (!token) {
    toast.add({
      title: 'Could not delete task',
      description: 'Preview the destructive change again before confirming.',
      color: 'error',
    })
    return
  }
  await deleteTask({ id: props.task._id, _confirmationToken: token })
}
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
      <UBadge size="xs" variant="subtle" :color="priorityColor">{{ props.task.priority }}</UBadge>
      <span v-if="props.task.assigneeId" class="ml-2">{{
        resolveName(props.task.assigneeId)
      }}</span>
    </p>

    <div class="flex gap-1.5">
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
      <UButton
        v-if="props.task._can.delete"
        size="xs"
        variant="soft"
        color="error"
        leading-icon="i-lucide-trash-2"
        @click="handleDeleteTask"
      >
        Delete
      </UButton>
    </div>
  </article>
</template>
