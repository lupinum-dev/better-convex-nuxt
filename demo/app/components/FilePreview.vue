<script setup lang="ts">
import { api } from '@@/convex/_generated/api'
import type { Id } from '@@/convex/_generated/dataModel'

const props = defineProps<{
  storageId: Id<'_storage'>
  filename: string
}>()

const storageIdRef = computed(() => props.storageId)
const imageUrl = useConvexStorageUrl(api.files.getUrl, storageIdRef)
</script>

<template>
  <div class="w-full h-full">
    <img
      v-if="imageUrl"
      :src="imageUrl"
      :alt="filename"
      class="w-full h-full object-cover"
    />
    <div
      v-else
      class="w-full h-full flex items-center justify-center"
    >
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
    </div>
  </div>
</template>
