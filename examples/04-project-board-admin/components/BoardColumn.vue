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
  <section class="column">
    <header class="column-header">
      <h3>{{ title }}</h3>
      <span>{{ tasks.length }}</span>
    </header>

    <div class="column-body">
      <TaskCard
        v-for="task in tasks"
        :key="task._id"
        :project-id="projectId"
        :task="task"
        :selected="selectedIds.includes(task._id)"
        @toggle-selected="emit('toggleSelected', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.column {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid #dbe4ef;
  border-radius: 20px;
  background: #f8fbff;
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.column-header h3 {
  margin: 0;
}

.column-body {
  display: grid;
  gap: 0.75rem;
}
</style>
