<template>
  <div
    class="min-h-screen p-6 bg-linear-to-br from-green-50 to-white dark:from-green-950/20 dark:to-neutral-950"
  >
    <div class="max-w-[1100px] mx-auto space-y-4">
      <UCard>
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <UButton
              :to="`/projects/${projectId}`"
              variant="link"
              leading-icon="i-lucide-arrow-left"
              class="mb-2"
            >
              Back to board
            </UButton>
            <h1 class="text-2xl font-bold">{{ task?.title || 'Task detail' }}</h1>
            <p class="text-sm text-muted mt-1">
              This page uses <code>useCachedQuery</code> so the card you clicked can render
              immediately from the already-fetched board list.
            </p>
          </div>
          <UBadge v-if="task" variant="subtle" size="lg">{{ task.status }}</UBadge>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-[320px_1fr]">
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">Task meta</h2>
          </template>

          <div class="space-y-3">
            <div>
              <p class="text-sm text-muted">Priority</p>
              <p class="font-medium">{{ task?.priority }}</p>
            </div>
            <div>
              <p class="text-sm text-muted">Owner</p>
              <p class="font-medium">{{ task?.ownerId }}</p>
            </div>
            <div>
              <p class="text-sm text-muted">Assignee</p>
              <p class="font-medium">{{ task?.assigneeId || 'Unassigned' }}</p>
            </div>

            <div v-if="canAssign && members?.length" class="space-y-1 pt-2">
              <label class="text-sm font-medium text-highlighted">Assign task</label>
              <select
                :value="task?.assigneeId || ''"
                class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
                @change="handleAssigneeChange"
              >
                <option value="">Unassigned</option>
                <option v-for="member in members" :key="member._id" :value="member.authId">
                  {{ member.displayName || member.authId }}
                </option>
              </select>
            </div>
          </div>
        </UCard>

        <UCard>
          <CommentThread v-if="task" :task-id="task._id" />
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * Task detail is where cache-backed navigation and nested comments come together.
 * The board route passes `projectId` so this page can reuse the list query as placeholder data.
 */
import { computed } from 'vue'

import { api } from '~/convex/_generated/api'
import type { Id } from '~/convex/_generated/dataModel'

definePageMeta({
  convexAuth: true,
})

const route = useRoute()
const { can } = usePermissions()

const taskId = computed(() => route.params.id as Id<'tasks'>)
const projectId = route.query.projectId as Id<'projects'>
const canAssign = can('task.assign')

const { data: task } = await useCachedQuery(
  api.tasks.get,
  computed(() => ({ id: taskId.value })),
  {
    from: {
      query: api.tasks.listByProject,
      args: { projectId },
      find: (tasks) => tasks.find((candidate) => candidate._id === taskId.value),
    },
  },
)

const { data: members } = await useConvexQuery(
  api.members.list,
  computed(() => (canAssign.value ? {} : undefined)),
)

const assignTask = useConvexMutation(api.tasks.assign)

async function handleAssign(assigneeId: string | undefined) {
  await assignTask({
    id: taskId.value,
    assigneeId,
  })
}

async function handleAssigneeChange(event: Event) {
  const select = event.target as HTMLSelectElement
  await handleAssign(select.value || undefined)
}
</script>
