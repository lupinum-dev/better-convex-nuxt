<script setup lang="ts">
/**
 * Why this file exists:
 * The board stays deliberately simple: three columns and cards with optimistic status moves.
 * The interesting part is the data flow, not a drag-and-drop library choice.
 */
import type { Doc, Id } from '~/convex/_generated/dataModel'

defineProps<{
  title: string
  projectId: Id<'projects'>
  tasks: Doc<'tasks'>[]
  selectedIds: Id<'tasks'>[]
}>()

const emit = defineEmits<{
  toggleSelected: [id: Id<'tasks'>]
}>()
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <UBadge variant="subtle" color="neutral">{{ tasks.length }}</UBadge>
      </div>
    </template>

    <div class="space-y-3">
      <TaskCard
        v-for="task in tasks"
        :key="task._id"
        :project-id="projectId"
        :task="task"
        :selected="selectedIds.includes(task._id)"
        @toggle-selected="emit('toggleSelected', $event)"
      />

      <p v-if="!tasks.length" class="text-sm text-muted text-center py-4">No tasks</p>
    </div>
  </UCard>
</template>
