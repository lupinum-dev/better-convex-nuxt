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
  <div class="attachment">
    <label class="picker">
      <span>Attachment</span>
      <input data-testid="attachment-input" type="file" @change="handleFile" />
    </label>

    <p v-if="pending.value" class="hint">Uploading… {{ progress.value }}%</p>
    <p v-if="error.value" class="error">{{ error.value.message }}</p>

    <div v-if="previewUrl" class="preview">
      <a :href="previewUrl" target="_blank" rel="noreferrer">Open uploaded file</a>
    </div>
  </div>
</template>

<style scoped>
.attachment {
  display: grid;
  gap: 0.5rem;
}

.picker {
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
}

.hint {
  margin: 0;
  color: #5b6472;
}

.error {
  margin: 0;
  color: #b42318;
}
</style>
