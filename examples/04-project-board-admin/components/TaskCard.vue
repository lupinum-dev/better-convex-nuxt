<script setup lang="ts">
/**
 * Why this file exists:
 * This is the optimistic update demo. The task card mutates the board immediately, then the
 * realtime query confirms or rolls it back.
 */
import type { Doc, Id } from '~/convex/_generated/dataModel'
import { api } from '~/convex/_generated/api'

const props = defineProps<{
  projectId: Id<'projects'>
  task: Doc<'tasks'>
  selected: boolean
}>()

const emit = defineEmits<{
  toggleSelected: [id: Id<'tasks'>]
}>()

const { can } = usePermissions()

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
  <article class="task-card" :data-testid="`task-card-${props.task._id}`">
    <label class="select-row">
      <input
        type="checkbox"
        :checked="selected"
        @change="emit('toggleSelected', props.task._id)"
      />
      <span>Select</span>
    </label>

    <NuxtLink
      class="title"
      :data-testid="`task-link-${props.task._id}`"
      :to="`/tasks/${props.task._id}?projectId=${props.projectId}`"
    >
      {{ props.task.title }}
    </NuxtLink>

    <p class="meta">
      {{ props.task.priority }} priority
      <span v-if="props.task.assigneeId"> · assigned to {{ props.task.assigneeId }}</span>
    </p>

    <button
      v-if="props.task.status !== 'done'"
      :data-testid="`task-move-${props.task._id}`"
      class="ghost"
      type="button"
      :disabled="!can('task.update', props.task)"
      @click="moveTask({ id: props.task._id, status: nextStatus() })"
    >
      Move to {{ nextStatus().replace('_', ' ') }}
    </button>
  </article>
</template>

<style scoped>
.task-card {
  display: grid;
  gap: 0.6rem;
  border: 1px solid #dbe4ef;
  border-radius: 16px;
  padding: 0.9rem;
  background: #fff;
}

.select-row {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  font-size: 0.85rem;
  color: #667085;
}

.title {
  color: #0f172a;
  font-weight: 600;
  text-decoration: none;
}

.meta {
  margin: 0;
  color: #667085;
  font-size: 0.85rem;
}
</style>
