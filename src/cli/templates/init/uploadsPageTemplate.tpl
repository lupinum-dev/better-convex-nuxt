<script setup lang="ts">
import { api } from '#trellis/api'

const {
  upload,
  pending,
  progress,
  data: storageId,
  error,
  reset,
} = useConvexUpload(api.features.files.domain.generateUploadUrlMutation, {
  allowedTypes: ['image/*', 'application/pdf'],
  maxSizeBytes: 5_000_000,
})

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await upload(file)
}
</script>

<template>
  <main>
    <h1>Uploads Starter</h1>
    <input type="file" @change="onFile" />
    <p v-if="pending">Uploading: {{ progress }}%</p>
    <p v-if="storageId">Stored as {{ storageId }}</p>
    <p v-if="error">{{ error.message }}</p>
    <button type="button" @click="reset">Reset</button>
  </main>
</template>
