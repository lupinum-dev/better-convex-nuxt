<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * File Upload Demo Page
 *
 * Demonstrates useConvexFileUpload and useConvexStorageUrl composables.
 */

const {
  upload,
  pending,
  progress,
  status,
  error,
  data: storageId,
  cancel,
} = useConvexFileUpload(api.files.generateUploadUrl)

// Get URL for uploaded file (automatically skips when storageId is undefined)
const imageUrl = useConvexStorageUrl(api.files.getUrl, storageId)

// Track upload history for demo
const uploadHistory = ref<Array<{ id: string; name: string; size: number }>>([])

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const id = await upload(file)
    uploadHistory.value.unshift({
      id,
      name: file.name,
      size: file.size,
    })
  } catch {
    // Error is tracked in the composable
  }

  // Clear the input
  input.value = ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="upload-page">
    <header class="page-header">
      <NuxtLink to="/" class="back-link">&larr; Home</NuxtLink>
      <h1>File Upload Demo</h1>
    </header>

    <section class="upload-section">
      <h2>Upload a File</h2>

      <div class="upload-area" :class="{ uploading: pending }">
        <input
          id="file-input"
          type="file"
          accept="image/*"
          :disabled="pending"
          @change="handleFileChange"
        />
        <label for="file-input" class="upload-label">
          <span v-if="!pending">Choose a file or drag & drop</span>
          <span v-else>Uploading...</span>
        </label>

        <div v-if="pending" class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }" />
          </div>
          <span class="progress-text">{{ progress }}%</span>
          <button class="cancel-btn" @click="cancel">Cancel</button>
        </div>
      </div>

      <div class="status-row">
        <span class="status-label">Status:</span>
        <code :class="`status-${status}`">{{ status }}</code>
        <button v-if="status !== 'idle'" class="reset-btn" @click="cancel">
          Clear
        </button>
      </div>

      <div v-if="error" class="error-message">
        {{ error.message }}
      </div>
    </section>

    <section v-if="imageUrl" class="preview-section">
      <h2>Last Uploaded</h2>
      <div class="preview-card">
        <img :src="imageUrl" alt="Uploaded file" class="preview-image" />
        <div class="preview-info">
          <code class="storage-id">{{ storageId }}</code>
        </div>
      </div>
    </section>

    <section v-if="uploadHistory.length > 0" class="history-section">
      <h2>Upload History</h2>
      <div class="history-list">
        <div v-for="item in uploadHistory" :key="item.id" class="history-item">
          <span class="file-name">{{ item.name }}</span>
          <span class="file-size">{{ formatBytes(item.size) }}</span>
          <code class="file-id">{{ item.id.slice(0, 12) }}...</code>
        </div>
      </div>
    </section>

    <section class="code-section">
      <h2>Code Example</h2>
      <pre><code>&lt;script setup&gt;
import { api } from '~/convex/_generated/api'

const {
  upload,
  pending,
  progress,
  cancel,
  data: storageId
} = useConvexFileUpload(api.files.generateUploadUrl)

const imageUrl = useConvexStorageUrl(api.files.getUrl, storageId)

async function handleFile(e) {
  const file = e.target.files?.[0]
  if (file) await upload(file)
}
&lt;/script&gt;

&lt;template&gt;
  &lt;input type="file" @change="handleFile" :disabled="pending" /&gt;
  &lt;div v-if="pending"&gt;
    Uploading: {{ progress }}%
    &lt;button @click="cancel"&gt;Cancel&lt;/button&gt;
  &lt;/div&gt;
  &lt;img v-if="imageUrl" :src="imageUrl" /&gt;
&lt;/template&gt;</code></pre>
    </section>
  </div>
</template>

<style scoped>
.upload-page {
  max-width: 700px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  margin-bottom: 30px;
}

.back-link {
  color: #666;
  text-decoration: none;
  font-size: 0.9rem;
}

.back-link:hover {
  color: #333;
}

h1 {
  margin: 10px 0 0;
  font-size: 1.8rem;
}

h2 {
  font-size: 1.2rem;
  margin: 0 0 15px;
  color: #333;
}

section {
  margin-bottom: 40px;
}

/* Upload Area */
.upload-area {
  border: 2px dashed #ccc;
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
  transition: all 0.2s;
  background: #fafafa;
}

.upload-area:hover {
  border-color: #999;
  background: #f5f5f5;
}

.upload-area.uploading {
  border-color: #1976d2;
  background: #e3f2fd;
}

.upload-area input[type="file"] {
  display: none;
}

.upload-label {
  display: block;
  cursor: pointer;
  color: #666;
  font-size: 1rem;
}

.progress-container {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #1976d2;
  transition: width 0.1s ease-out;
}

.progress-text {
  font-size: 0.9rem;
  font-weight: 500;
  color: #1976d2;
  min-width: 40px;
}

.cancel-btn {
  padding: 4px 12px;
  font-size: 0.8rem;
  border: 1px solid #c62828;
  border-radius: 4px;
  background: #ffebee;
  color: #c62828;
  cursor: pointer;
}

.cancel-btn:hover {
  background: #ffcdd2;
}

/* Status */
.status-row {
  margin-top: 15px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-label {
  color: #666;
  font-size: 0.9rem;
}

code {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
}

.status-idle {
  background: #f0f0f0;
  color: #666;
}

.status-pending {
  background: #e3f2fd;
  color: #1565c0;
}

.status-success {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-error {
  background: #ffebee;
  color: #c62828;
}

.reset-btn {
  padding: 4px 12px;
  font-size: 0.8rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.reset-btn:hover {
  background: #f5f5f5;
}

.error-message {
  margin-top: 15px;
  padding: 12px 16px;
  background: #ffebee;
  color: #c62828;
  border-radius: 8px;
  font-size: 0.9rem;
}

/* Preview */
.preview-card {
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.preview-image {
  width: 100%;
  max-height: 300px;
  object-fit: contain;
  background: #f5f5f5;
}

.preview-info {
  padding: 12px 16px;
  border-top: 1px solid #e0e0e0;
}

.storage-id {
  background: #f0f0f0;
  word-break: break-all;
}

/* History */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 0.9rem;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  color: #666;
  font-size: 0.8rem;
}

.file-id {
  background: #f0f0f0;
  font-size: 0.75rem;
}

/* Code */
.code-section pre {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 20px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.85rem;
  line-height: 1.5;
}
</style>
