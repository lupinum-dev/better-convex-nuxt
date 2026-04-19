<script setup lang="ts">
import { api } from '#trellis/api'
/**
 * Why this file exists:
 * Real apps hit file uploads quickly. This component keeps the upload flow isolated so the task
 * detail page can stay focused on the permission and comment story.
 *
 * Deliberate tradeoff for this pass:
 * after upload we only keep a local pre-submit preview. Saved attachments are not reopened through
 * Convex until there is a scoped comment/task download path.
 */
import type { Id } from '~/convex/_generated/dataModel'

const modelValue = defineModel<Id<'_storage'> | null | undefined>()
const localPreviewUrl = ref<string | null>(null)

const {
  upload,
  pending,
  progress,
  data: uploadedStorageId,
  error,
} = useConvexUpload(api.domain.files.generateUploadUrl, {
  allowedTypes: ['image/*', 'text/*', 'application/pdf'],
  maxSizeBytes: 5_000_000,
})

watch(uploadedStorageId, (nextValue) => {
  if (nextValue) {
    modelValue.value = nextValue as Id<'_storage'>
  }
})

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
  }
  localPreviewUrl.value = URL.createObjectURL(file)
  await upload(file)
}

watch(modelValue, (nextValue) => {
  if (!nextValue && localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
    localPreviewUrl.value = null
  }
})

onBeforeUnmount(() => {
  if (localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
  }
})
</script>

<template>
  <div class="space-y-2">
    <label class="block text-sm font-medium text-highlighted">
      Attachment
      <input
        data-testid="attachment-input"
        type="file"
        class="mt-1 block text-sm"
        @change="handleFile"
      />
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

    <div v-if="localPreviewUrl">
      <UButton
        variant="link"
        :to="localPreviewUrl"
        target="_blank"
        leading-icon="i-lucide-paperclip"
      >
        Preview selected file
      </UButton>
    </div>
  </div>
</template>
