<template>
  <main class="page">
    <section class="shell">
      <header class="toolbar">
        <div>
          <NuxtLink class="back" to="/">← Back to projects</NuxtLink>
          <h1>{{ project?.name || 'Project board' }}</h1>
          <p class="hint">{{ project?.summary || 'Track work across the team.' }}</p>
        </div>

        <div class="toolbar-actions">
          <a
            class="ghost link"
            :href="`/api/export?projectId=${projectId}`"
            target="_blank"
            rel="noreferrer"
          >
            Export CSV
          </a>
          <NuxtLink v-if="can('workspace.audit')" class="ghost link" to="/admin">Admin</NuxtLink>
        </div>
      </header>

      <form v-if="canCreateTask" class="composer" @submit.prevent="handleCreateTask">
        <label class="field">
          <span>Task title</span>
          <input
            v-model="taskForm.title"
            data-testid="task-title"
            class="input"
            placeholder="Review the board refresh"
            required
          />
        </label>
        <label class="field">
          <span>Priority</span>
          <select v-model="taskForm.priority" class="input">
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <button
          data-testid="task-submit"
          class="button"
          :disabled="createTask.pending.value"
        >
          {{ createTask.pending.value ? 'Adding…' : 'Add task' }}
        </button>
      </form>

      <BulkActions
        :selected-ids="selectedIds"
        @cleared="selectedIds = []"
      />

      <div class="board">
        <BoardColumn
          title="Backlog"
          :project-id="projectId"
          :tasks="backlogTasks"
          :selected-ids="selectedIds"
          @toggle-selected="toggleSelected"
        />
        <BoardColumn
          title="In Progress"
          :project-id="projectId"
          :tasks="inProgressTasks"
          :selected-ids="selectedIds"
          @toggle-selected="toggleSelected"
        />
        <BoardColumn
          title="Done"
          :project-id="projectId"
          :tasks="doneTasks"
          :selected-ids="selectedIds"
          @toggle-selected="toggleSelected"
        />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * This page shows the "month two" board patterns in one place: scoped queries, optimistic
 * mutations, bulk operations, and permission-aware UI on top of the same tenant model as Example 03.
 */
import { computed, reactive, ref } from 'vue'

import { api } from '~/convex/_generated/api'
import type { Id } from '~/convex/_generated/dataModel'

definePageMeta({
  convexAuth: true,
})

useAuthGuard({
  can: 'project.read',
  redirectTo: '/',
})

const route = useRoute()
const { can } = usePermissions()
const projectId = computed(() => route.params.id as Id<'projects'>)

const taskForm = reactive({
  title: '',
  priority: 'medium' as 'low' | 'medium' | 'high',
})
const selectedIds = ref<Id<'tasks'>[]>([])

const createTask = useConvexMutation(api.tasks.create)
const canCreateTask = can('task.create')

const { data: project } = await useConvexQuery(
  api.projects.get,
  computed(() => ({ id: projectId.value })),
)

const { data: tasks } = await useConvexQuery(
  api.tasks.listByProject,
  computed(() => ({ projectId: projectId.value })),
)

const backlogTasks = computed(() => tasks.value?.filter(task => task.status === 'backlog') ?? [])
const inProgressTasks = computed(() =>
  tasks.value?.filter(task => task.status === 'in_progress') ?? [],
)
const doneTasks = computed(() => tasks.value?.filter(task => task.status === 'done') ?? [])

async function handleCreateTask() {
  await createTask({
    projectId: projectId.value,
    title: taskForm.title,
    priority: taskForm.priority,
  })
  taskForm.title = ''
  taskForm.priority = 'medium'
}

function toggleSelected(id: Id<'tasks'>) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(current => current !== id)
    : [...selectedIds.value, id]
}
</script>

<style scoped>
.page {
  padding: 2rem;
  background: #eef4fb;
  min-height: 100vh;
}

.shell {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}

.toolbar,
.toolbar-actions,
.composer {
  display: flex;
  gap: 1rem;
  align-items: end;
  justify-content: space-between;
  flex-wrap: wrap;
}

.board {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.composer,
.toolbar {
  padding: 1rem;
  border: 1px solid #dbe4ef;
  border-radius: 20px;
  background: white;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.input {
  min-width: 220px;
  padding: 0.75rem 0.85rem;
  border: 1px solid #c7d4e5;
  border-radius: 12px;
}

.button,
.ghost {
  padding: 0.75rem 1rem;
  border-radius: 999px;
  border: 1px solid #355fb0;
  cursor: pointer;
}

.button {
  background: #355fb0;
  color: white;
}

.ghost {
  background: white;
  color: #355fb0;
}

.hint,
.back {
  margin: 0;
  color: #667085;
}

.link,
.back {
  text-decoration: none;
}
</style>
