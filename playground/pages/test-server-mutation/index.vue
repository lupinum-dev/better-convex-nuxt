<template>
  <div class="container">
    <h1>Server-Side Convex Operations Test</h1>
    <p class="description">
      This page tests the <code>fetchQuery</code>, <code>fetchMutation</code>, and
      <code>fetchAction</code>
      server utilities. These are called from Nuxt API routes, not from the browser directly.
    </p>

    <div class="section">
      <h2>Test fetchQuery (Server-Side)</h2>
      <p>Fetches notes from Convex using an API route that calls <code>fetchQuery</code>.</p>

      <div class="controls">
        <label>
          Limit:
          <input v-model.number="queryLimit" type="number" min="1" max="50" />
        </label>
        <button :disabled="queryLoading" @click="testServerQuery">
          {{ queryLoading ? 'Fetching...' : 'Fetch Notes from Server' }}
        </button>
      </div>

      <div
        v-if="queryResult"
        class="result"
        :class="{ success: queryResult.success, error: !queryResult.success }"
      >
        <div class="result-header">
          <strong>{{ queryResult.success ? 'Success!' : 'Error' }}</strong>
          <span class="meta">Executed on: {{ queryResult.executedOn }}</span>
        </div>
        <div v-if="queryResult.success" class="result-body">
          <p>Fetched {{ queryResult.count }} of {{ queryResult.totalAvailable }} notes</p>
          <ul class="notes-list">
            <li v-for="note in queryResult.notes" :key="note._id">
              <strong>{{ note.title }}</strong>
              <span class="note-content">{{ note.content?.substring(0, 50) }}...</span>
            </li>
          </ul>
        </div>
        <pre v-else>{{ queryResult.error }}</pre>
      </div>
    </div>

    <div class="section">
      <h2>Test fetchMutation (Server-Side)</h2>
      <p>
        Creates a note from the server using an API route that calls <code>fetchMutation</code>.
      </p>

      <div class="controls">
        <input v-model="noteTitle" type="text" placeholder="Note title" class="text-input" />
        <input v-model="noteContent" type="text" placeholder="Note content" class="text-input" />
        <button :disabled="mutationLoading" @click="testServerMutation">
          {{ mutationLoading ? 'Creating...' : 'Create Note from Server' }}
        </button>
      </div>

      <div
        v-if="mutationResult"
        class="result"
        :class="{ success: mutationResult.success, error: !mutationResult.success }"
      >
        <div class="result-header">
          <strong>{{ mutationResult.success ? 'Success!' : 'Error' }}</strong>
          <span class="meta">Executed on: {{ mutationResult.meta?.executedOn }}</span>
        </div>
        <div v-if="mutationResult.success" class="result-body">
          <p>{{ mutationResult.message }}</p>
          <p>
            <strong>Note ID:</strong> <code>{{ mutationResult.noteId }}</code>
          </p>
          <p><strong>Created at:</strong> {{ mutationResult.createdAt }}</p>
        </div>
        <pre v-else>{{ mutationResult.error }}</pre>
      </div>
    </div>

    <div class="section">
      <h2>Live Notes (Client-Side Real-Time)</h2>
      <p>
        This list uses <code>useConvexQuery</code> with real-time subscription. When you create a
        note from the server, it should appear here automatically!
      </p>

      <div v-if="notesPending" class="loading">Loading notes...</div>
      <div v-else-if="notesError" class="error">Error: {{ notesError }}</div>
      <ul v-else class="notes-list live">
        <li v-for="note in notes" :key="note._id">
          <strong>{{ note.title }}</strong>
          <span class="note-content">{{ note.content?.substring(0, 80) }}</span>
          <span class="note-time">{{ formatTime(note.createdAt) }}</span>
        </li>
        <li v-if="!notes?.length">No notes yet. Create one!</li>
      </ul>
    </div>

    <div class="code-example">
      <h2>Code Examples</h2>

      <h3>API Route (server/api/notes.post.ts)</h3>
      <pre><code>import { api } from '~/convex/_generated/api'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  // fetchMutation is auto-imported on server!
  const noteId = await fetchMutation(
    config.public.convex.url,
    api.notes.add,
    { title: body.title, content: body.content }
  )

  return { noteId }
})</code></pre>

      <h3>Webhook Handler</h3>
      <pre><code>// server/api/webhook.post.ts
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const payload = await readBody(event)

  // Process webhook and update Convex
  await fetchMutation(
    config.public.convex.url,
    api.orders.updateStatus,
    { orderId: payload.orderId, status: 'completed' }
  )

  return { ok: true }
})</code></pre>
    </div>

    <NuxtLink to="/" class="back-link"> &larr; Back to Home </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { api } from '~/convex/_generated/api'

// Server query test
const queryLimit = ref(5)
const queryLoading = ref(false)
const queryResult = ref<{
  success: boolean
  count?: number
  totalAvailable?: number
  notes?: Array<{ _id: string, title: string, content: string }>
  executedOn?: string
  error?: string
} | null>(null)

async function testServerQuery() {
  queryLoading.value = true
  queryResult.value = null
  try {
    queryResult.value = await $fetch(`/api/test-server-query?limit=${queryLimit.value}`)
  }
  catch (e) {
    queryResult.value = { success: false, error: String(e) }
  }
  finally {
    queryLoading.value = false
  }
}

// Server mutation test
const noteTitle = ref('')
const noteContent = ref('')
const mutationLoading = ref(false)
const mutationResult = ref<{
  success: boolean
  message?: string
  noteId?: string
  createdAt?: string
  meta?: { executedOn: string }
  error?: string
} | null>(null)

async function testServerMutation() {
  mutationLoading.value = true
  mutationResult.value = null
  try {
    mutationResult.value = await $fetch('/api/test-server-mutation', {
      method: 'POST',
      body: {
        title: noteTitle.value || undefined,
        content: noteContent.value || undefined,
      },
    })
    // Clear inputs on success
    if (mutationResult.value?.success) {
      noteTitle.value = ''
      noteContent.value = ''
    }
  }
  catch (e) {
    mutationResult.value = { success: false, error: String(e) }
  }
  finally {
    mutationLoading.value = false
  }
}

// Live notes subscription (client-side)
const { data: notes, pending: notesPending, error: notesError } = useConvexQuery(
  api.notes.list,
  {},
)

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<style scoped>
.container {
  max-width: 900px;
  margin: 40px auto;
  padding: 20px;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  margin-bottom: 8px;
}

h2 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: 1.2em;
}

h3 {
  margin-top: 16px;
  margin-bottom: 8px;
  font-size: 1em;
  color: #666;
}

.description {
  color: #666;
  margin-bottom: 24px;
}

code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.section {
  background: #f9f9f9;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.controls label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.controls input[type="number"] {
  width: 60px;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.text-input {
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  flex: 1;
  min-width: 150px;
}

.controls button {
  background: #2196f3;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 1em;
  cursor: pointer;
  transition: background 0.2s;
}

.controls button:hover:not(:disabled) {
  background: #1976d2;
}

.controls button:disabled {
  background: #90caf9;
  cursor: not-allowed;
}

.result {
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
}

.result.success {
  background: #e8f5e9;
  border: 1px solid #c8e6c9;
}

.result.error {
  background: #ffebee;
  border: 1px solid #ffcdd2;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.result-header .meta {
  font-size: 0.85em;
  color: #666;
  background: rgba(0,0,0,0.05);
  padding: 4px 8px;
  border-radius: 4px;
}

.result-body p {
  margin: 8px 0;
}

.result pre {
  background: rgba(0,0,0,0.05);
  padding: 12px;
  border-radius: 4px;
  overflow: auto;
  margin: 0;
}

.notes-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.notes-list li {
  padding: 12px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notes-list.live li {
  border-left: 3px solid #4caf50;
}

.note-content {
  font-size: 0.9em;
  color: #666;
}

.note-time {
  font-size: 0.8em;
  color: #999;
}

.loading {
  padding: 20px;
  text-align: center;
  color: #666;
}

.code-example {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.code-example h2 {
  color: white;
  border-bottom: 1px solid #444;
  padding-bottom: 8px;
}

.code-example h3 {
  color: #9cdcfe;
}

.code-example pre {
  background: #2d2d2d;
  padding: 16px;
  border-radius: 6px;
  overflow: auto;
  font-size: 0.85em;
  line-height: 1.5;
}

.code-example code {
  background: transparent;
  padding: 0;
  color: inherit;
}

.back-link {
  display: inline-block;
  color: #2196f3;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
