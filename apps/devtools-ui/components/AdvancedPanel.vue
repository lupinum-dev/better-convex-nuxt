<script setup lang="ts">
import type { ConvexDevtoolsSnapshot } from '../../../src/runtime/devtools/types'

defineProps<{
  snapshot: ConvexDevtoolsSnapshot
}>()
</script>

<template>
  <div class="p-4">
    <SectionBlock
      text="Raw Store Snapshot"
      icon="i-carbon-code"
      description="Live state from the host application"
    >
      <NCodeBlock
        :code="JSON.stringify(snapshot, null, 2)"
        lang="json"
        class="text-xs max-h-[calc(100vh-200px)] overflow-auto"
      />
    </SectionBlock>
  </div>
</template>
