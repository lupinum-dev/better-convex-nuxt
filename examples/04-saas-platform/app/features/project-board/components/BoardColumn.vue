<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'

import type { BoardTask } from '../types/board-task'
import TaskCard from './TaskCard.vue'

defineProps<{
  title: string
  projectId: Id<'projects'>
  tasks: BoardTask[]
  selectedIds: Id<'tasks'>[]
  memberNames?: Map<string, string>
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
        :member-names="memberNames"
        @toggle-selected="emit('toggleSelected', $event)"
      />

      <div v-if="!tasks.length" class="text-center py-8">
        <span class="iconify i-lucide-inbox text-2xl text-muted" />
        <p class="text-sm text-muted mt-1">No tasks</p>
      </div>
    </div>
  </UCard>
</template>
