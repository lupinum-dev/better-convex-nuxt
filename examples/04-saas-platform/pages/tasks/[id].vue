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
/**
 * Why this file exists:
 * Task detail is where cache-backed navigation and nested comments come together.
 * The board route passes `projectId` so this page can reuse the list query as placeholder data.
 */
import { computed } from 'vue'

import { api } from '#trellis/api'
import type { Id } from '~/convex/_generated/dataModel'
import { taskAssign } from '~/convex/auth/permissions'

definePageMeta({
  convexAuth: true,
})

const route = useRoute()
const toast = useToast()
const { allows } = usePermissions()

const taskId = computed(() => route.params.id as Id<'tasks'>)
const projectId = route.query.projectId as Id<'projects'>
const canAssign = allows(taskAssign)

const { data: task } = await useCachedQuery(
  api.domain.tasks.get,
  computed(() => ({ id: taskId.value })),
  {
    from: {
      query: api.domain.tasks.listByProject,
      args: { projectId },
      find: (tasks) => tasks.find((candidate) => candidate._id === taskId.value),
    },
  },
)

const { data: members } = await useConvexQuery(
  api.domain.members.list,
  computed(() => (canAssign.value ? {} : undefined)),
)

const memberNames = computed(() => {
  const map = new Map<string, string>()
  for (const m of members.value ?? []) {
    map.set(m.authId, m.displayName || m.email || m.authId)
  }
  return map
})

const assigneeOptions = computed(() =>
  (members.value ?? []).map((m) => ({
    label: m.displayName || m.email || m.authId,
    value: m.authId,
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

function resolveName(authId: string | undefined) {
  if (!authId) return 'Unassigned'
  return memberNames.value.get(authId) ?? `Member ${authId.slice(0, 8)}…`
}

const assignTask = useConvexMutation(api.domain.tasks.assign, {
  onSuccess: () => toast.add({ title: 'Assignee updated', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not assign task', description: error.message, color: 'error' }),
})

async function handleAssign(value: string | undefined) {
  await assignTask({
    id: taskId.value,
    assigneeId: value,
  })
}
</script>
