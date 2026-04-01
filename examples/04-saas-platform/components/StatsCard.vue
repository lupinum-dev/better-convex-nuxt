<script setup lang="ts">
/**
 * Why this file exists:
 * The admin page uses a few tiny metric cards so readers can see multiple live queries
 * composing on one page without adding a full charting library.
 */
defineProps<{
  label: string
  value: number | string | undefined
}>()
</script>

<template>
  <UCard class="text-center">
    <p class="text-sm text-muted">{{ label }}</p>
    <p class="text-3xl font-bold mt-1">{{ value ?? '—' }}</p>
  </UCard>
</template>
