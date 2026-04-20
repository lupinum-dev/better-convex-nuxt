<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">Agency Portfolio</h3>
      <p class="text-sm text-muted mt-1">
        Cross-client view. Only shows workspaces where you have an agency role, without weakening
        the normal tenant boundary. This is the one place where the example intentionally steps
        outside the active workspace.
      </p>
    </template>

    <div v-if="!portfolio?.length" class="flex flex-col items-center gap-2 py-8 text-muted">
      <UIcon name="i-lucide-briefcase" class="w-8 h-8" />
      <p class="text-sm">No assigned clients yet.</p>
      <p class="text-xs">
        Join another workspace with the <strong>agency_admin</strong> or
        <strong>agency_manager</strong> role, or seed the portfolio from the workspace switcher.
      </p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="entry in portfolio"
        :key="entry.workspace.id"
        class="rounded-xl border border-default bg-elevated p-4"
      >
        <div class="flex items-center gap-2">
          <p class="font-semibold text-highlighted">{{ entry.workspace.name }}</p>
          <UBadge color="warning" variant="subtle" size="xs">{{ entry.role }}</UBadge>
        </div>
        <div class="mt-2 flex gap-4 text-sm text-muted">
          <span>
            Active: <span class="font-semibold text-highlighted">{{ entry.activeProjects }}</span>
          </span>
          <span>
            Total: <span class="font-semibold text-highlighted">{{ entry.totalProjects }}</span>
          </span>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
defineProps<{
  portfolio: Array<{
    workspace: { id: string; name: string }
    role: string
    activeProjects: number
    totalProjects: number
  }> | null
}>()
</script>
