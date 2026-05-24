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
          <UBadge v-if="task" variant="subtle" size="lg" :color="statusColor">{{
            statusLabel
          }}</UBadge>
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
              <p class="font-medium">{{ resolveName(task?.ownerId) }}</p>
            </div>
            <div>
              <p class="text-sm text-muted">Assignee</p>
              <p class="font-medium">{{ resolveName(task?.assigneeId) }}</p>
            </div>

            <div v-if="canAssign && members?.length" class="space-y-1 pt-2">
              <label class="text-sm font-medium text-highlighted">Assign task</label>
              <USelect
                :model-value="task?.assigneeId"
                :items="assigneeOptions"
                placeholder="Unassigned"
                @update:model-value="handleAssign"
              />
            </div>
          </div>
        </UCard>

        <UCard>
          <CommentThread v-if="task" :task-id="task._id" :member-names="memberNames" />
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#trellis/api'
import { taskAssign } from '#trellis/permissions'

import CommentThread from './CommentThread.vue'

const route = useRoute()
const toast = useToast()
const { can } = useAccess()

const taskId = computed(() => route.params.id as Id<'tasks'>)
const projectId = route.query.projectId as Id<'projects'>
const canAssign = can(taskAssign)

const { data: task } = await useCachedQuery(
  api.features.tasks.domain.get,
  computed(() => ({ id: taskId.value })),
  {
    from: {
      query: api.features.tasks.domain.listByProject,
      args: { projectId },
      find: (tasks) => tasks.find((candidate) => candidate._id === taskId.value),
    },
  },
)

const { data: members } = await useConvexQuery(
  api.features.members.domain.list,
  computed(() => (task.value ? {} : undefined)),
)

const memberNames = computed(() => {
  const map = new Map<string, string>()
  for (const m of members.value ?? []) {
    map.set(m._id, m.displayName || m.email || m.authKey)
  }
  return map
})

const assigneeOptions = computed(() =>
  (members.value ?? []).map((m) => ({
    label: m.displayName || m.email || m.authKey,
    value: m._id,
  })),
)

const statusColor = computed(() => {
  if (task.value?.status === 'done') return 'success'
  if (task.value?.status === 'in_progress') return 'info'
  return 'neutral'
})

const statusLabel = computed(() =>
  (task.value?.status ?? '').replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()),
)

function resolveName(userId: string | undefined) {
  if (!userId) return 'Unassigned'
  return memberNames.value.get(userId) ?? `Member ${userId.slice(0, 8)}…`
}

const assignTaskMutation = useConvexMutation(api.features.tasks.domain.assign, {
  onSuccess: () => toast.add({ title: 'Assignee updated', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not assign task', description: error.message, color: 'error' }),
})

async function handleAssign(value: string | undefined) {
  await assignTaskMutation({
    id: taskId.value,
    assigneeId: value,
  })
}
</script>
