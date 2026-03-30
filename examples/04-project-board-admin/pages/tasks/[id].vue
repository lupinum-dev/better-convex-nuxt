<template>
  <main class="page">
    <section class="shell">
      <header class="toolbar">
        <div>
          <NuxtLink class="back" :to="`/projects/${projectId}`">← Back to board</NuxtLink>
          <h1>{{ task?.title || 'Task detail' }}</h1>
          <p class="hint">
            This page uses <code>useCachedQuery</code> so the card you clicked can render
            immediately from the already-fetched board list.
          </p>
        </div>
        <span class="badge">{{ task?.status }}</span>
      </header>

      <section class="detail-grid">
        <article class="card">
          <h2>Task meta</h2>
          <p><strong>Priority:</strong> {{ task?.priority }}</p>
          <p><strong>Owner:</strong> {{ task?.ownerId }}</p>
          <p><strong>Assignee:</strong> {{ task?.assigneeId || 'Unassigned' }}</p>

          <label v-if="canAssign && members?.length" class="field">
            <span>Assign task</span>
            <select
              :value="task?.assigneeId || ''"
              class="input"
              @change="handleAssign(($event.target as HTMLSelectElement).value || undefined)"
            >
              <option value="">Unassigned</option>
              <option v-for="member in members" :key="member._id" :value="member.authId">
                {{ member.displayName || member.authId }}
              </option>
            </select>
          </label>
        </article>

        <article class="card">
          <CommentThread v-if="task" :task-id="task._id" />
        </article>
      </section>
    </section>
  </main>
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
      find: tasks => tasks.find(candidate => candidate._id === taskId.value),
    },
  },
)

const { data: members } = await useConvexQuery(
  api.members.list,
  computed(() => canAssign.value ? {} : undefined),
)

const assignTask = useConvexMutation(api.tasks.assign)

async function handleAssign(assigneeId: string | undefined) {
  await assignTask({
    id: taskId.value,
    assigneeId,
  })
}
</script>

<style scoped>
.page {
  padding: 2rem;
  background: #eef4fb;
  min-height: 100vh;
}

.shell {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}

.toolbar,
.detail-grid {
  display: grid;
  gap: 1rem;
}

.detail-grid {
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
}

.card,
.toolbar {
  padding: 1rem;
  border: 1px solid #dbe4ef;
  border-radius: 20px;
  background: white;
}

.badge {
  justify-self: start;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: #e8efff;
  color: #355fb0;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.input {
  width: 100%;
  padding: 0.75rem 0.85rem;
  border: 1px solid #c7d4e5;
  border-radius: 12px;
}

.hint,
.back {
  color: #667085;
}

.back {
  text-decoration: none;
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
