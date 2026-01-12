<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for file upload status tracking
 *
 * Tests all states of useConvexFileUpload:
 * - idle: initial state, no upload running
 * - pending: upload in progress
 * - success: upload completed successfully
 * - error: upload failed
 *
 * Also tests cancel() function and progress tracking
 */

const {
  upload,
  pending,
  status,
  progress,
  error,
  data: storageId,
  cancel,
} = useConvexFileUpload(api.files.generateUploadUrl)

// Get URL for uploaded file
const imageUrl = useConvexStorageUrl(api.files.getUrl, storageId)

// Track upload counts
const successCount = ref(0)
const cancelCount = ref(0)

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    await upload(file)
    successCount.value++
  } catch (e) {
    // Check if it was a cancel
    if (e instanceof DOMException && e.name === 'AbortError') {
      cancelCount.value++
    }
    // Error is tracked in error ref
  }

  input.value = ''
}

function handleCancel() {
  cancel()
}
</script>

<template>
  <div data-testid="file-upload-status-page" class="test-page">
    <h1>File Upload Status Tracking</h1>

    <section class="control-section">
      <div class="upload-control">
        <input
          data-testid="file-input"
          type="file"
          accept="image/*"
          :disabled="pending"
          @change="handleFileChange"
        />
      </div>

      <button
        data-testid="cancel-btn"
        class="btn cancel-btn"
        :disabled="!pending"
        @click="handleCancel"
      >
        Cancel Upload
      </button>
    </section>

    <section class="state-section">
      <h2>Upload State</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="status" class="value">{{ status }}</span>
        </div>
        <div class="state-item">
          <span class="label">pending:</span>
          <span data-testid="pending" class="value">{{ pending }}</span>
        </div>
        <div class="state-item">
          <span class="label">progress:</span>
          <span data-testid="progress" class="value">{{ progress }}</span>
        </div>
        <div class="state-item">
          <span class="label">error:</span>
          <span data-testid="error" class="value">{{ error?.message ?? 'null' }}</span>
        </div>
        <div class="state-item">
          <span class="label">storageId:</span>
          <span data-testid="storage-id" class="value">{{ storageId ?? 'undefined' }}</span>
        </div>
        <div class="state-item">
          <span class="label">imageUrl:</span>
          <span data-testid="image-url" class="value">{{ imageUrl ?? 'null' }}</span>
        </div>
      </div>
    </section>

    <section class="count-section">
      <h2>Counts</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">success count:</span>
          <span data-testid="success-count" class="value">{{ successCount }}</span>
        </div>
        <div class="state-item">
          <span class="label">cancel count:</span>
          <span data-testid="cancel-count" class="value">{{ cancelCount }}</span>
        </div>
      </div>
    </section>

    <section v-if="imageUrl" class="preview-section">
      <h2>Preview</h2>
      <img
        data-testid="preview-image"
        :src="imageUrl"
        alt="Uploaded file"
        class="preview-image"
      />
    </section>

    <!-- Progress bar for visual feedback during tests -->
    <div v-if="pending" data-testid="progress-bar" class="progress-bar">
      <div class="progress-fill" :style="{ width: `${progress}%` }" />
    </div>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.control-section {
  display: flex;
  gap: 10px;
  margin: 20px 0;
  flex-wrap: wrap;
  align-items: center;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.cancel-btn {
  background: #f44336;
  color: white;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.state-section,
.count-section,
.preview-section {
  margin: 20px 0;
  padding: 15px;
  background: #f8f8f8;
  border-radius: 8px;
}

.state-section h2,
.count-section h2,
.preview-section h2 {
  margin: 0 0 15px;
  font-size: 1rem;
}

.state-grid {
  display: grid;
  gap: 8px;
}

.state-item {
  display: flex;
  gap: 10px;
}

.label {
  font-weight: 500;
  min-width: 130px;
}

.value {
  font-family: monospace;
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  word-break: break-all;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-image {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
}

.progress-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 20px;
}

.progress-fill {
  height: 100%;
  background: #1976d2;
  transition: width 0.1s ease-out;
}
</style>
