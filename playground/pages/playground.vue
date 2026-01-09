<template>
  <div class="container">
    <header class="header">
      <h1>useConvexQuery Playground</h1>
      <p class="subtitle">Test SSR, real-time updates, reactive args, and more</p>
      <NuxtLink to="/" class="back-link">&larr; Back to Home</NuxtLink>
    </header>

    <!-- Section 1: Basic Query with SSR -->
    <section class="section">
      <h2>1. Basic Query (SSR)</h2>
      <p class="description">Data fetched on server, then real-time updates on client</p>

      <div class="status-row">
        <span
          class="badge"
          :class="{ loading: notesPending, success: !notesPending && !notesError, error: notesError }"
        >
          {{ notesPending ? 'Loading...' : notesError ? 'Error' : 'Ready' }}
        </span>
        <span class="ssr-badge">SSR: {{ wasSSR ? 'Yes' : 'No' }}</span>
      </div>

      <div v-if="notesError" class="error-box">
        {{ notesError.message }}
      </div>

      <div v-else-if="notes && notes.length > 0" class="notes-list">
        <div v-for="note in notes" :key="note._id" class="note-card">
          <h4>{{ note.title }}</h4>
          <p>{{ note.content }}</p>
          <div class="note-actions">
            <button class="btn-small btn-danger" @click="deleteNote(note._id)">Delete</button>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">No notes yet. Add one below!</div>

      <!-- Add Note Form -->
      <form class="add-form" @submit.prevent="addNote">
        <input v-model="newNoteTitle" placeholder="Title" :disabled="isAdding" />
        <input v-model="newNoteContent" placeholder="Content" :disabled="isAdding" />
        <button type="submit" :disabled="!newNoteTitle.trim() || isAdding">
          {{ isAdding ? 'Adding...' : 'Add Note' }}
        </button>
      </form>
    </section>

    <!-- Section 2: Reactive Args -->
    <section class="section">
      <h2>2. Reactive Args</h2>
      <p class="description">Query re-fetches when args change</p>

      <div class="search-box">
        <input v-model="searchQuery" placeholder="Search notes..." class="search-input" />
      </div>

      <div class="status-row">
        <span class="badge" :class="{ loading: searchPending, success: !searchPending }">
          {{ searchPending ? 'Searching...' : 'Ready' }}
        </span>
        <span class="info">Query: "{{ searchQuery || '(empty)' }}"</span>
      </div>

      <div v-if="searchResults && searchResults.length > 0" class="notes-list small">
        <div v-for="note in searchResults" :key="note._id" class="note-card small">
          <h4>{{ note.title }}</h4>
          <p>{{ note.content }}</p>
        </div>
      </div>
      <div v-else-if="searchQuery" class="empty-state small">
        No results for "{{ searchQuery }}"
      </div>
      <div v-else class="empty-state small">Type to search...</div>
    </section>

    <!-- Section 3: Skip Pattern -->
    <section class="section">
      <h2>3. Skip Pattern</h2>
      <p class="description">Query can be conditionally skipped</p>

      <div class="controls">
        <label>
          <input v-model="enableSkipDemo" type="checkbox" />
          Enable query (uncheck to skip)
        </label>
      </div>

      <div class="status-row">
        <span
          class="badge"
          :class="{ loading: skipDemoPending, success: !skipDemoPending && enableSkipDemo, muted: !enableSkipDemo }"
        >
          {{ !enableSkipDemo ? 'Skipped' : skipDemoPending ? 'Loading...' : 'Ready' }}
        </span>
      </div>

      <div v-if="enableSkipDemo && skipDemoData" class="code-block">
        <pre>{{ JSON.stringify(skipDemoData, null, 2) }}</pre>
      </div>
      <div v-else class="empty-state small">
        {{ enableSkipDemo ? 'Loading...' : 'Query is skipped' }}
      </div>
    </section>

    <!-- Section 4: useNuxtData (Cache Access) -->
    <section class="section">
      <h2>4. useNuxtData (Cache Access)</h2>
      <p class="description">Read cached data without triggering a new fetch</p>

      <div class="code-block">
        <pre>
// Access cached notes list using native Nuxt pattern
const { data: cachedNotes } = useNuxtData(getQueryKey(api.notes.list, {}))
// Count: {{ cachedNotes?.length ?? 'undefined' }}</pre
        >
      </div>

      <div v-if="cachedNotes !== undefined">
        <span class="badge success">Cache hit: {{ cachedNotes.length }} notes</span>
      </div>
      <div v-else>
        <span class="badge muted">Cache miss (undefined)</span>
      </div>
    </section>

    <!-- Section 5: Options Demo -->
    <section class="section">
      <h2>5. Query Options</h2>
      <p class="description">Different configuration options</p>

      <div class="options-grid">
        <div class="option-card">
          <h4>lazy: true</h4>
          <p>Doesn't block navigation</p>
          <span class="badge" :class="{ loading: lazyPending }">
            {{ lazyPending ? 'Loading...' : `${lazyData?.length ?? 0} notes` }}
          </span>
        </div>

        <div class="option-card">
          <h4>initialData: []</h4>
          <p>Shows placeholder immediately</p>
          <span class="badge success">
            {{ initialDataDemo?.length ?? 0 }} notes (initial: [])
          </span>
        </div>

        <div class="option-card">
          <h4>server: false</h4>
          <p>Client-only fetching</p>
          <span class="badge" :class="{ loading: clientOnlyPending, success: !clientOnlyPending }">
            {{ clientOnlyPending ? 'Loading...' : `${clientOnlyData?.length ?? 0} notes` }}
          </span>
        </div>
      </div>
    </section>

    <!-- Section 6: Verbose Logging -->
    <section class="section">
      <h2>6. Verbose Logging</h2>
      <p class="description">Check browser console for detailed logs</p>

      <div class="code-block">
        <pre>
const { data } = useConvexQuery(api.notes.list, {}, {
  verbose: true // Check console!
})</pre
        >
      </div>

      <p class="hint">Open DevTools &rarr; Console to see detailed query lifecycle logs</p>
    </section>

    <!-- Debug Section -->
    <details class="debug-section">
      <summary>Debug Info</summary>
      <pre>{{ debugInfo }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
import { api } from '~/convex/_generated/api'
import type { Id } from '~/convex/_generated/dataModel'

// Mutations using the new composable
const addNoteMutation = useConvexMutation(api.notes.add)
const deleteNoteMutation = useConvexMutation(api.notes.remove)

// Track if we got SSR data (use useState to persist across hydration)
const wasSSR = useState('playground-was-ssr', () => import.meta.server)

// ========== Section 1: Basic Query ==========
const {
  data: notes,
  pending: notesPending,
  error: notesError,
} = useConvexQuery(api.notes.list, {}, { verbose: true })

// Form state for adding notes
const newNoteTitle = ref('')
const newNoteContent = ref('')
const isAdding = ref(false)

async function addNote() {
  if (!newNoteTitle.value.trim()) return

  isAdding.value = true
  try {
    await addNoteMutation.mutate({
      title: newNoteTitle.value.trim(),
      content: newNoteContent.value.trim() || 'No content',
    })
    newNoteTitle.value = ''
    newNoteContent.value = ''
    // Real-time subscription will update automatically!
  }
  catch (e) {
    console.error('Failed to add note:', e)
  }
  finally {
    isAdding.value = false
  }
}

async function deleteNote(id: Id<'notes'>) {
  try {
    await deleteNoteMutation.mutate({ id })
    // Real-time subscription will update automatically!
  }
  catch (e) {
    console.error('Failed to delete note:', e)
  }
}

// ========== Section 2: Reactive Args ==========
// Use useState for values that affect query args to prevent hydration mismatch
const searchQuery = useState('playground-search-query', () => '')
const debouncedQuery = useState('playground-debounced-query', () => '')

// Debounce logic (client-only)
if (import.meta.client) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(searchQuery, (val) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedQuery.value = val
    }, 300)
  })
}

const searchArgs = computed(() => {
  if (!debouncedQuery.value.trim()) return 'skip' as const
  return { query: debouncedQuery.value }
})

const {
  data: searchResults,
  pending: searchPending,
} = useConvexQuery(api.notes.search, searchArgs, { verbose: true })

// ========== Section 3: Skip Pattern ==========
const enableSkipDemo = useState('playground-skip-demo', () => true)

const skipArgs = computed(() => {
  return enableSkipDemo.value ? {} : 'skip' as const
})

const {
  data: skipDemoData,
  pending: skipDemoPending,
} = useConvexQuery(api.notes.list, skipArgs)

// ========== Section 4: useNuxtData (Cache Access) ==========
const { data: cachedNotes } = useNuxtData(getQueryKey(api.notes.list, {}))

// ========== Section 5: Options Demo ==========

// Lazy loading
const {
  data: lazyData,
  pending: lazyPending,
} = useConvexQuery(api.notes.list, {}, { lazy: true })

// Default data (factory function that provides initial value)
const {
  data: initialDataDemo,
} = useConvexQuery(api.notes.list, {}, { default: () => [] })

// Client-only
const {
  data: clientOnlyData,
  pending: clientOnlyPending,
} = useConvexQuery(api.notes.list, {}, { server: false })

// ========== Debug ==========
const debugInfo = computed(() => ({
  wasSSR: wasSSR.value,
  notes: {
    count: notes.value?.length ?? 'undefined',
    pending: notesPending.value,
    error: notesError.value?.message ?? null,
  },
  search: {
    query: searchQuery.value,
    debouncedQuery: debouncedQuery.value,
    resultsCount: searchResults.value?.length ?? 'undefined',
    pending: searchPending.value,
  },
  skipDemo: {
    enabled: enableSkipDemo.value,
    dataCount: skipDemoData.value?.length ?? 'undefined',
    pending: skipDemoPending.value,
  },
  cachedNotes: cachedNotes.value?.length ?? 'undefined',
  lazyData: lazyData.value?.length ?? 'undefined',
  clientOnlyData: clientOnlyData.value?.length ?? 'undefined',
}))
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: system-ui, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

.header h1 {
  font-size: 2rem;
  margin-bottom: 8px;
}

.subtitle {
  color: #666;
  margin-bottom: 16px;
}

.back-link {
  color: #3b82f6;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.section h2 {
  font-size: 1.3rem;
  margin-bottom: 8px;
  color: #1f2937;
}

.description {
  color: #6b7280;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.badge.loading {
  background: #fef3c7;
  color: #92400e;
}

.badge.success {
  background: #d1fae5;
  color: #065f46;
}

.badge.error {
  background: #fee2e2;
  color: #991b1b;
}

.badge.muted {
  background: #f3f4f6;
  color: #6b7280;
}

.ssr-badge {
  background: #e0e7ff;
  color: #3730a3;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
}

.info {
  color: #6b7280;
  font-size: 0.85rem;
}

.error-box {
  background: #fee2e2;
  color: #991b1b;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.notes-list.small {
  gap: 8px;
}

.note-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.note-card.small {
  padding: 12px;
}

.note-card h4 {
  margin: 0 0 8px 0;
  font-size: 1rem;
}

.note-card p {
  margin: 0;
  color: #6b7280;
  font-size: 0.9rem;
}

.note-actions {
  margin-top: 12px;
}

.btn-small {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
}

.btn-danger:hover {
  background: #fecaca;
}

.empty-state {
  text-align: center;
  color: #9ca3af;
  padding: 32px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 16px;
}

.empty-state.small {
  padding: 16px;
}

.add-form {
  display: flex;
  gap: 8px;
}

.add-form input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.9rem;
}

.add-form button {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.add-form button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.search-box {
  margin-bottom: 16px;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.controls {
  margin-bottom: 16px;
}

.controls label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.code-block {
  background: #1f2937;
  color: #e5e7eb;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 16px;
}

.code-block pre {
  margin: 0;
  font-family: 'Fira Code', 'Monaco', monospace;
  font-size: 0.85rem;
  line-height: 1.5;
}

.hint {
  color: #6b7280;
  font-size: 0.85rem;
  font-style: italic;
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.option-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.option-card h4 {
  font-family: monospace;
  font-size: 0.9rem;
  margin: 0 0 8px 0;
  color: #7c3aed;
}

.option-card p {
  margin: 0 0 12px 0;
  color: #6b7280;
  font-size: 0.85rem;
}

.debug-section {
  margin-top: 40px;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 16px;
}

.debug-section summary {
  cursor: pointer;
  font-weight: 500;
  color: #6b7280;
}

.debug-section pre {
  margin-top: 12px;
  font-size: 0.8rem;
  overflow-x: auto;
}
</style>
