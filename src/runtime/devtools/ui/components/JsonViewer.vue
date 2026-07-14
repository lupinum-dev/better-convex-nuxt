<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  data: unknown
  maxHeight?: string
}>()

const formattedJson = computed(() => {
  if (props.data === undefined) {
    return 'undefined'
  }
  if (props.data === null) {
    return 'null'
  }

  try {
    const json = JSON.stringify(
      props.data,
      (_, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v),
      2,
    )

    return json
  } catch {
    return '[Circular]'
  }
})
</script>

<template>
  <div class="json-viewer" :style="{ maxHeight: maxHeight || '200px' }">{{ formattedJson }}</div>
</template>
