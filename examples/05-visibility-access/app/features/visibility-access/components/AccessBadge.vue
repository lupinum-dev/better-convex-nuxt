<template>
  <UBadge v-if="level" :color="colors[level]" variant="subtle" size="xs">
    {{ level }}
  </UBadge>
</template>

<script setup lang="ts">
const props = defineProps<{
  level?: 'view' | 'comment' | 'edit' | null
}>()

const colors: Record<string, 'info' | 'warning' | 'success'> = {
  view: 'info',
  comment: 'warning',
  edit: 'success',
}
</script>
