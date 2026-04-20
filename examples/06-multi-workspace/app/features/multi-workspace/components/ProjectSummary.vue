<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">Projects</h3>
      <p class="text-sm text-muted mt-1">
        Tenant-scoped. Only shows projects belonging to the current workspace.
      </p>
    </template>

    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4 text-sm">
        <span>
          <span class="text-2xl font-bold text-highlighted">{{ activeCount }}</span>
          <span class="ml-1 text-muted">active</span>
        </span>
        <span v-if="pausedCount">
          <span class="text-2xl font-bold text-muted">{{ pausedCount }}</span>
          <span class="ml-1 text-muted">paused</span>
        </span>
      </div>
      <UButton to="/projects" trailing-icon="i-lucide-arrow-right"> View projects </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  projects: Array<{ status: string }> | null
}>()

const activeCount = computed(
  () => (props.projects ?? []).filter((project) => project.status === 'active').length,
)
const pausedCount = computed(
  () => (props.projects ?? []).filter((project) => project.status === 'paused').length,
)
</script>
