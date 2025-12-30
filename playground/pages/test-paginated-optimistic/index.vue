<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'
import { api } from '~~/convex/_generated/api'

/**
 * Playground: Paginated Query Optimistic Update Helpers
 *
 * Demonstrates:
 * - insertAtTop: Add item to beginning (newest-first lists)
 * - insertAtPosition: Add item at sorted position (by createdAt)
 * - insertAtBottomIfLoaded: Add to end only when all pages loaded
 * - optimisticallyUpdateValueInPaginatedQuery: Update existing items
 * - deleteFromPaginatedQuery: Remove items from results
 */

// --------------------------------------------------------------------------
// 1. Descending order (newest first) - uses insertAtTop
// --------------------------------------------------------------------------
const {
  results: notesDesc,
  status: statusDesc,
  loadMore: loadMoreDesc,
} = useConvexPaginatedQuery(
  api.notes.listPaginated,
  {},
  { initialNumItems: 3, verbose: true },
)

// Add with insertAtTop - item appears at top immediately
const { mutate: addNoteTop, pending: pendingTop } = useConvexMutation(
  api.notes.add,
  {
    optimisticUpdate: (localStore, args) => {
      console.log('[insertAtTop] Adding note optimistically:', args.title)

      insertAtTop({
        paginatedQuery: api.notes.listPaginated,
        localQueryStore: localStore,
        item: {
          _id: crypto.randomUUID() as Id<'notes'>,
          _creationTime: Date.now(),
          title: args.title,
          content: args.content,
          createdAt: Date.now(),
        },
      })
    },
  },
)

// --------------------------------------------------------------------------
// 2. Ascending order (oldest first) - uses insertAtBottomIfLoaded
// --------------------------------------------------------------------------
const {
  results: notesAsc,
  status: statusAsc,
  loadMore: loadMoreAsc,
} = useConvexPaginatedQuery(
  api.notes.listPaginatedAsc,
  {},
  { initialNumItems: 3, verbose: true },
)

// Add with insertAtBottomIfLoaded - only works when all pages loaded
const { mutate: addNoteBottom, pending: pendingBottom } = useConvexMutation(
  api.notes.add,
  {
    optimisticUpdate: (localStore, args) => {
      console.log('[insertAtBottomIfLoaded] Adding note optimistically:', args.title)
      console.log('[insertAtBottomIfLoaded] Will only insert if isDone=true (all pages loaded)')

      insertAtBottomIfLoaded({
        paginatedQuery: api.notes.listPaginatedAsc,
        localQueryStore: localStore,
        item: {
          _id: crypto.randomUUID() as Id<'notes'>,
          _creationTime: Date.now(),
          title: args.title,
          content: args.content,
          createdAt: Date.now(),
        },
      })
    },
  },
)

// --------------------------------------------------------------------------
// 3. Insert at sorted position - by createdAt descending
// --------------------------------------------------------------------------
const { mutate: addNoteSorted, pending: pendingSorted } = useConvexMutation(
  api.notes.add,
  {
    optimisticUpdate: (localStore, args) => {
      console.log('[insertAtPosition] Adding note at sorted position:', args.title)

      insertAtPosition({
        paginatedQuery: api.notes.listPaginated,
        sortOrder: 'desc',
        sortKeyFromItem: note => note.createdAt,
        localQueryStore: localStore,
        item: {
          _id: crypto.randomUUID() as Id<'notes'>,
          _creationTime: Date.now(),
          title: args.title,
          content: args.content,
          createdAt: Date.now(),
        },
      })
    },
  },
)

// --------------------------------------------------------------------------
// 4. Delete item from paginated results
// --------------------------------------------------------------------------
const { mutate: removeNote, pending: pendingRemove } = useConvexMutation(
  api.notes.remove,
  {
    optimisticUpdate: (localStore, args) => {
      console.log('[deleteFromPaginatedQuery] Removing note:', args.id)

      // Delete from both queries
      deleteFromPaginatedQuery({
        paginatedQuery: api.notes.listPaginated,
        localQueryStore: localStore,
        shouldDelete: note => note._id === args.id,
      })

      deleteFromPaginatedQuery({
        paginatedQuery: api.notes.listPaginatedAsc,
        localQueryStore: localStore,
        shouldDelete: note => note._id === args.id,
      })
    },
  },
)

// --------------------------------------------------------------------------
// Action Handlers
// --------------------------------------------------------------------------
async function handleAddTop() {
  const timestamp = Date.now()
  await addNoteTop({
    title: `[TOP] Note ${timestamp}`,
    content: `Added with insertAtTop at ${new Date(timestamp).toISOString()}`,
  })
}

async function handleAddBottom() {
  const timestamp = Date.now()
  await addNoteBottom({
    title: `[BOTTOM] Note ${timestamp}`,
    content: `Added with insertAtBottomIfLoaded at ${new Date(timestamp).toISOString()}`,
  })
}

async function handleAddSorted() {
  const timestamp = Date.now()
  await addNoteSorted({
    title: `[SORTED] Note ${timestamp}`,
    content: `Added with insertAtPosition at ${new Date(timestamp).toISOString()}`,
  })
}

async function handleDelete(id: string) {
  await removeNote({ id: id as Id<'notes'> })
}
</script>

<template>
  <div class="page">
    <h1>Pagination Optimistic Update Helpers</h1>
    <p>Open the console to see optimistic update logs.</p>

    <NuxtLink to="/" class="back-link"> Back to Home </NuxtLink>

    <div class="panels">
      <!-- LEFT PANEL: Descending (newest first) -->
      <section class="panel">
        <h2>Descending (newest first)</h2>
        <p class="hint">Uses <span class="code">insertAtTop</span> - items appear at beginning</p>

        <div class="actions">
          <button :disabled="pendingTop" class="btn btn-green" @click="handleAddTop">
            {{ pendingTop ? 'Adding...' : 'Add with insertAtTop' }}
          </button>
          <button :disabled="pendingSorted" class="btn btn-blue" @click="handleAddSorted">
            {{ pendingSorted ? 'Adding...' : 'Add with insertAtPosition' }}
          </button>
          <button
            :disabled="statusDesc !== 'CanLoadMore'"
            class="btn btn-gray"
            @click="loadMoreDesc(3)"
          >
            Load More
          </button>
        </div>

        <div class="status">
          Status: <span class="code">{{ statusDesc }}</span> | Count:
          <span class="code">{{ notesDesc?.length ?? 0 }}</span>
        </div>

        <ul v-if="notesDesc?.length" class="notes-list">
          <li v-for="note in notesDesc" :key="note._id" class="note-item">
            <div class="note-content">
              <strong>{{ note.title }}</strong>
              <small>{{ note.content }}</small>
            </div>
            <button :disabled="pendingRemove" class="btn-delete" @click="handleDelete(note._id)">
              Delete
            </button>
          </li>
        </ul>
        <div v-else class="empty">No notes yet</div>

        <div v-if="statusDesc === 'Exhausted'" class="exhausted">All pages loaded</div>
      </section>

      <!-- RIGHT PANEL: Ascending (oldest first) -->
      <section class="panel">
        <h2>Ascending (oldest first)</h2>
        <p class="hint">
          Uses <span class="code">insertAtBottomIfLoaded</span> - only works when all pages loaded
        </p>

        <div class="actions">
          <button :disabled="pendingBottom" class="btn btn-purple" @click="handleAddBottom">
            {{ pendingBottom ? 'Adding...' : 'Add with insertAtBottomIfLoaded' }}
          </button>
          <button
            :disabled="statusAsc !== 'CanLoadMore'"
            class="btn btn-gray"
            @click="loadMoreAsc(3)"
          >
            Load More
          </button>
        </div>

        <div class="status">
          Status: <span class="code">{{ statusAsc }}</span> | Count:
          <span class="code">{{ notesAsc?.length ?? 0 }}</span>
          <span v-if="statusAsc === 'Exhausted'" class="status-hint">
            (insertAtBottomIfLoaded will work!)
          </span>
          <span v-else class="status-hint status-warning">
            (insertAtBottomIfLoaded won't insert - not all pages loaded)
          </span>
        </div>

        <ul v-if="notesAsc?.length" class="notes-list">
          <li v-for="note in notesAsc" :key="note._id" class="note-item">
            <div class="note-content">
              <strong>{{ note.title }}</strong>
              <small>{{ note.content }}</small>
            </div>
            <button :disabled="pendingRemove" class="btn-delete" @click="handleDelete(note._id)">
              Delete
            </button>
          </li>
        </ul>
        <div v-else class="empty">No notes yet</div>

        <div v-if="statusAsc === 'Exhausted'" class="exhausted">All pages loaded</div>
      </section>
    </div>

    <!-- HELPER REFERENCE -->
    <section class="reference">
      <h2>Helper Reference</h2>
      <div class="helper-grid">
        <div class="helper">
          <h3>insertAtTop</h3>
          <p>Add item at beginning. Use for descending-sorted lists (newest first).</p>
        </div>
        <div class="helper">
          <h3>insertAtPosition</h3>
          <p>Add item at correct sorted position. Requires sortOrder and sortKeyFromItem.</p>
        </div>
        <div class="helper">
          <h3>insertAtBottomIfLoaded</h3>
          <p>Add item at end, but only when isDone=true (all pages loaded).</p>
        </div>
        <div class="helper">
          <h3>deleteFromPaginatedQuery</h3>
          <p>Remove items using a shouldDelete predicate function.</p>
        </div>
        <div class="helper">
          <h3>optimisticallyUpdateValueInPaginatedQuery</h3>
          <p>Update existing items using an updateValue function.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.back-link {
  display: inline-block;
  margin-bottom: 20px;
  color: #0066cc;
}

.panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 40px;
}

@media (max-width: 800px) {
  .panels {
    grid-template-columns: 1fr;
  }
}

.panel {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
}

.panel h2 {
  margin: 0 0 4px 0;
  font-size: 1.25rem;
}

.hint {
  margin: 0 0 16px 0;
  font-size: 0.875rem;
  color: #666;
}

.code {
  background: #e9ecef;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85em;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  color: white;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-green { background: #22c55e; }
.btn-green:hover:not(:disabled) { background: #16a34a; }

.btn-blue { background: #3b82f6; }
.btn-blue:hover:not(:disabled) { background: #2563eb; }

.btn-purple { background: #8b5cf6; }
.btn-purple:hover:not(:disabled) { background: #7c3aed; }

.btn-gray { background: #6b7280; }
.btn-gray:hover:not(:disabled) { background: #4b5563; }

.status {
  font-size: 0.875rem;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: white;
  border-radius: 6px;
}

.status-hint {
  display: block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: #22c55e;
}

.status-warning {
  color: #f59e0b;
}

.notes-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.note-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: white;
  border-radius: 8px;
}

.note-content {
  flex: 1;
  min-width: 0;
}

.note-content strong {
  display: block;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-content small {
  display: block;
  font-size: 0.75rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-delete {
  padding: 4px 10px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.btn-delete:hover:not(:disabled) {
  background: #dc2626;
}

.btn-delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty {
  padding: 24px;
  text-align: center;
  color: #666;
  background: white;
  border-radius: 8px;
}

.exhausted {
  margin-top: 8px;
  padding: 8px;
  text-align: center;
  background: #dcfce7;
  color: #166534;
  border-radius: 6px;
  font-size: 0.875rem;
}

.reference {
  margin-top: 40px;
  padding: 24px;
  background: #f8f9fa;
  border-radius: 12px;
}

.reference h2 {
  margin: 0 0 16px 0;
}

.helper-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.helper {
  background: white;
  padding: 16px;
  border-radius: 8px;
}

.helper h3 {
  margin: 0 0 8px 0;
  font-size: 0.95rem;
  font-family: monospace;
  color: #1f2937;
}

.helper p {
  margin: 0;
  font-size: 0.85rem;
  color: #666;
}
</style>
