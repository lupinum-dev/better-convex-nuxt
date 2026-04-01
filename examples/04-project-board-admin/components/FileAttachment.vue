<script setup lang="ts">
/**
 * Why this file exists:
 * Real apps hit file uploads quickly. This component keeps the upload flow isolated so the task
 * detail page can stay focused on the permission and comment story.
 */
import type { Id } from '~/convex/_generated/dataModel'
import { api } from '~/convex/_generated/api'

const modelValue = defineModel<Id<'_storage'> | null | undefined>()

const {
  upload,
  pending,
  progress,
  data: uploadedStorageId,
  error,
} = useConvexUpload(api.files.generateUploadUrl, {
  allowedTypes: ['image/*', 'text/*', 'application/pdf'],
  maxSizeBytes: 5_000_000,
})

watch(uploadedStorageId, (nextValue) => {
  if (nextValue) {
    modelValue.value = nextValue
  }
})

const previewUrl = useConvexStorageUrl(api.files.getUrl, computed(() => modelValue.value))

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await upload(file)
}
</script>

<template>
  <div class="space-y-2">
    <label class="block text-sm font-medium text-highlighted">
      Attachment
      <input data-testid="attachment-input" type="file" class="mt-1 block text-sm" @change="handleFile" />
    </label>

    <div v-if="pending" class="space-y-1">
      <p class="text-sm text-muted">Uploading… {{ progress }}%</p>
      <UProgress :value="progress" />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="error.message"
    />

    <div v-if="previewUrl">
      <UButton
        variant="link"
        :to="previewUrl"
        target="_blank"
        leading-icon="i-lucide-paperclip"
      >
        Open uploaded file
      </UButton>
    </div>
  </div>
</template>
