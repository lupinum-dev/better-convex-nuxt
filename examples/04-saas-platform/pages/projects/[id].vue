<template>
  <div
    class="min-h-screen p-6 bg-linear-to-br from-green-50 to-white dark:from-green-950/20 dark:to-neutral-950"
  >
    <div class="max-w-[1200px] mx-auto space-y-4">
      <UCard>
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <UButton to="/" variant="link" leading-icon="i-lucide-arrow-left" class="mb-2">
              Back to projects
            </UButton>
            <h1 class="text-2xl font-bold">{{ project?.name || 'Project board' }}</h1>
            <p class="text-sm text-muted mt-1">
              {{ project?.summary || 'Track work across the team.' }}
            </p>
          </div>

          <div class="flex gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              leading-icon="i-lucide-download"
              :to="`/api/export?projectId=${projectId}`"
              target="_blank"
            >
              Export CSV
            </UButton>
            <UButton
              v-if="canAudit"
              to="/admin"
              color="neutral"
              variant="ghost"
              leading-icon="i-lucide-shield"
            >
              Admin
            </UButton>
          </div>
        </div>
      </UCard>

      <UCard v-if="canCreateTask">
        <form
          class="flex flex-col gap-3 md:flex-row md:items-end"
          @submit.prevent="handleCreateTask"
        >
          <div class="flex-1 space-y-1">
            <label class="text-sm font-medium text-highlighted">Task title</label>
            <UInput
              v-model="taskForm.title"
              data-testid="task-title"
              placeholder="Review the board refresh"
              required
            />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium text-highlighted">Priority</label>
            <USelect v-model="taskForm.priority" :items="['low', 'medium', 'high']" />
          </div>
          <UButton
            data-testid="task-submit"
            type="submit"
            :loading="createTask.pending.value"
            leading-icon="i-lucide-plus"
          >
            Add task
          </UButton>
        </form>
      </UCard>

      <BulkActions :selected-ids="selectedIds" @cleared="selectedIds = []" />

      <div class="grid gap-4 lg:grid-cols-3">
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
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * This page shows the "month two" board patterns in one place: scoped queries, optimistic
 * mutations, bulk operations, and permission-aware UI on top of the same tenant model as Example 03.
 */
import { computed, reactive, ref } from 'vue'

import { api } from '#trellis/api'
import type { Id } from '~/convex/_generated/dataModel'
import { saasPermissionKeys } from '~/shared/permissions'

definePageMeta({
  convexAuth: true,
})

useAuthGuard({
  can: saasPermissionKeys.projectRead,
  redirectTo: '/',
})

const route = useRoute()
const { can } = usePermissions()
const canAudit = can(saasPermissionKeys.workspaceAudit)
const projectId = computed(() => route.params.id as Id<'projects'>)

const taskForm = reactive({
  title: '',
  priority: 'medium' as 'low' | 'medium' | 'high',
})
const selectedIds = ref<Id<'tasks'>[]>([])

const createTask = useConvexMutation(api.tasks.create)
const canCreateTask = can(saasPermissionKeys.taskCreate)

const { data: project } = await useConvexQuery(
  api.projects.get,
  computed(() => ({ id: projectId.value })),
)

const { data: tasks } = await useConvexQuery(
  api.tasks.listByProject,
  computed(() => ({ projectId: projectId.value })),
)

const backlogTasks = computed(() => tasks.value?.filter((task) => task.status === 'backlog') ?? [])
const inProgressTasks = computed(
  () => tasks.value?.filter((task) => task.status === 'in_progress') ?? [],
)
const doneTasks = computed(() => tasks.value?.filter((task) => task.status === 'done') ?? [])

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
    ? selectedIds.value.filter((current) => current !== id)
    : [...selectedIds.value, id]
}
</script>
