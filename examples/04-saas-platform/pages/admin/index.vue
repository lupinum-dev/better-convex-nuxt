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

      <div class="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatsCard label="Active projects" :value="stats?.activeProjects" />
        <StatsCard label="Open tasks" :value="stats?.openTasks" />
        <StatsCard label="Completed today" :value="stats?.completedToday" />
        <StatsCard label="Team members" :value="members?.length" />
        <StatsCard label="Project limit" :value="usageLabel" />
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">Plan management</h2>
              <p class="text-sm text-muted mt-1">
                Current plan:
                <UBadge
                  :color="
                    ctx?.plan === 'enterprise'
                      ? 'success'
                      : ctx?.plan === 'pro'
                        ? 'info'
                        : 'neutral'
                  "
                  variant="subtle"
                >
                  {{ ctx?.plan || 'loading…' }}
                </UBadge>
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="ctx?.plan === 'free'"
                color="primary"
                @click="handleUpgrade('pro')"
                :loading="upgradePlan.pending.value"
              >
                Upgrade to Pro
              </UButton>
              <UButton
                v-if="ctx?.plan !== 'enterprise'"
                color="neutral"
                variant="soft"
                @click="handleUpgrade('enterprise')"
                :loading="upgradePlan.pending.value"
              >
                Upgrade to Enterprise
              </UButton>
            </div>
          </div>
        </template>

        <div v-if="ctx?.usage?.projects" class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted">Projects used</span>
            <span class="font-medium text-highlighted">
              {{ ctx.usage.projects.current }} /
              {{ ctx.usage.projects.max === Infinity ? '∞' : ctx.usage.projects.max }}
            </span>
          </div>
          <div class="h-2 rounded-full bg-elevated overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="usagePercent > 80 ? 'bg-warning' : 'bg-primary'"
              :style="{ width: `${Math.min(usagePercent, 100)}%` }"
            />
          </div>
          <p v-if="ctx.usage.projects.remaining === 0" class="text-xs text-warning">
            You've reached your plan limit. Upgrade to add more projects.
          </p>
        </div>
      </UCard>

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
 * Plan management shows how entitlements and usage limits integrate into the admin workflow.
 */
import { computed } from 'vue'

import { api } from '~/convex/_generated/api'
import { saasPermissionKeys } from '~/shared/permissions'

definePageMeta({
  convexAuth: true,
})

useAuthGuard({
  can: saasPermissionKeys.workspaceAudit,
  redirectTo: '/',
})

const { ctx } = usePermissions()
const { data: stats } = await useConvexQuery(api.dashboard.stats, {})
const { data: recentActivity } = await useConvexQuery(api.dashboard.recentActivity, { limit: 12 })
const { data: members } = await useConvexQuery(api.members.list, {})
const upgradePlan = useConvexMutation(api.workspaces.upgradePlan)

const usagePercent = computed(() => {
  const usage = ctx.value?.usage?.projects
  if (!usage || usage.max === Infinity) return 0
  return Math.round((usage.current / usage.max) * 100)
})

const usageLabel = computed(() => {
  const usage = ctx.value?.usage?.projects
  if (!usage) return '…'
  return `${usage.current}/${usage.max === Infinity ? '∞' : usage.max}`
})

async function handleUpgrade(plan: 'pro' | 'enterprise') {
  await upgradePlan({ plan })
}
</script>
