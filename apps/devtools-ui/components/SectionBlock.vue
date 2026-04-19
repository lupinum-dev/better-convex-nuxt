<script setup lang="ts">
defineProps<{
  icon?: string
  text?: string
  description?: string
  containerClass?: string
}>()
</script>

<template>
  <div class="border border-base rounded-lg">
    <div v-if="text" class="flex items-center gap-2 px-4 py-2 border-b border-base bg-hover">
      <div v-if="icon" :class="icon" class="text-base opacity-60" />
      <span class="text-sm font-medium">{{ text }}</span>
      <span v-if="description" class="text-xs opacity-50 ml-2">{{ description }}</span>
      <span class="flex-1" />
      <slot name="actions" />
    </div>
    <div class="p-4" :class="containerClass">
      <slot />
    </div>
  </div>
</template>
