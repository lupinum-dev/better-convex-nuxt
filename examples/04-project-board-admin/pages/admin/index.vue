<template>
  <div
    class="min-h-screen p-6 bg-linear-to-br from-green-50 to-white dark:from-green-950/20 dark:to-neutral-950"
  >
    <div class="max-w-[1200px] mx-auto space-y-4">
      <UCard>
        <div>
          <UButton to="/" variant="link" leading-icon="i-lucide-arrow-left" class="mb-2">
            Back to projects
          </UButton>
          <h1 class="text-3xl font-bold">Workspace admin</h1>
          <p class="text-sm text-muted mt-1">
            Three scoped queries run at once here: stats, recent activity, and members.
          </p>
        </div>
      </UCard>

      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard label="Active projects" :value="stats?.activeProjects" />
        <StatsCard label="Open tasks" :value="stats?.openTasks" />
        <StatsCard label="Completed today" :value="stats?.completedToday" />
        <StatsCard label="Team members" :value="members?.length" />
      </div>

      <div class="grid gap-4 lg:grid-cols-[1fr_380px]">
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">Recent activity</h2>
          </template>

          <div class="divide-y divide-default">
            <div
              v-for="event in recentActivity || []"
              :key="event._id"
              class="py-3 first:pt-0 last:pb-0"
            >
              <p class="font-medium">{{ event.action }}</p>
              <p class="text-sm text-muted mt-0.5">{{ event.description }}</p>
            </div>

            <p v-if="!recentActivity?.length" class="text-sm text-muted text-center py-6">
              No recent activity.
            </p>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">Members</h2>
          </template>

          <div>
            <MemberRow v-for="member in members || []" :key="member._id" :member="member" />

            <p v-if="!members?.length" class="text-sm text-muted text-center py-6">
              No members found.
            </p>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * The admin dashboard proves that multiple scoped queries can compose on one page and that role
 * changes propagate live into the rest of the app without any manual refresh logic.
 */
import { api } from '~/convex/_generated/api'

definePageMeta({
  convexAuth: true,
})

useAuthGuard({
  can: 'workspace.audit',
  redirectTo: '/',
})

const { data: stats } = await useConvexQuery(api.dashboard.stats, {})
const { data: recentActivity } = await useConvexQuery(api.dashboard.recentActivity, { limit: 12 })
const { data: members } = await useConvexQuery(api.members.list, {})
</script>
