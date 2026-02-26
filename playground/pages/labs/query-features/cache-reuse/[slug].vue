<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

definePageMeta({
  layout: 'sidebar',
})

type NoteRecord = {
  _id: Id<'notes'>
  title?: string
  content: string
  createdAt: number
}

function toExcerpt(value: string, max = 140): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max).trimEnd()}...`
}

function normalizeSlugParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function parseNoteIdFromSlug(value: string): Id<'notes'> | null {
  const rawId = value.split('--')[0]?.trim()
  if (!rawId) return null
  return rawId as Id<'notes'>
}

const route = useRoute()
const slugParam = computed(() => normalizeSlugParam(route.params.slug as string | string[] | undefined))
const noteId = computed(() => parseNoteIdFromSlug(slugParam.value))

const listCacheKey = getQueryKey(api.notes.list, {})
const { data: cachedNotes } = useNuxtData<NoteRecord[]>(listCacheKey)

const cachedCard = computed(() => {
  if (!noteId.value) return null
  const note = cachedNotes.value?.find(candidate => candidate._id === noteId.value)
  if (!note) return null
  return {
    _id: note._id,
    title: note.title ?? 'Untitled',
    description: toExcerpt(note.content),
    createdAt: note.createdAt,
  }
})

type DetailView = {
  id: string
  title: string
  description: string
  content: string | null
  createdAt: number | null
}

const {
  data: post,
  pending,
  error,
  status,
} = await useConvexQuery(
  api.notes.get,
  computed(() => (noteId.value ? { id: noteId.value } : 'skip')),
  {
    lazy: true,
    default: () => {
      if (!cachedCard.value) return undefined
      return {
        id: cachedCard.value._id,
        title: cachedCard.value.title,
        description: cachedCard.value.description,
        content: null,
        createdAt: cachedCard.value.createdAt,
      } satisfies DetailView
    },
    transform: (note): DetailView | null => {
      if (!note) return null
      return {
        id: note._id,
        title: note.title ?? 'Untitled',
        description: toExcerpt(note.content),
        content: note.content,
        createdAt: note.createdAt,
      }
    },
  },
)

const usedCachedPreview = computed(() => Boolean(cachedCard.value))
const showingPreviewOnly = computed(() => Boolean(post.value && post.value.content == null))
</script>

<template>
  <div class="page" data-testid="cache-reuse-detail-page">
    <div class="topbar">
      <NuxtLink to="/labs/query-features/cache-reuse" class="back-link">
        ← Back to cache reuse list
      </NuxtLink>
      <code class="slug">{{ slugParam }}</code>
    </div>

    <header class="hero">
      <h1>Slug Detail Page with Instant Reuse</h1>
      <p>
        This page reads cached list data via <code>useNuxtData(getQueryKey(api.notes.list, {}))</code>
        and uses it as the <code>default</code> for a <code>lazy: true</code> detail query.
      </p>
    </header>

    <section class="status-grid">
      <div class="status-item">
        <span class="label">query status</span>
        <code data-testid="detail-status">{{ status }}</code>
      </div>
      <div class="status-item">
        <span class="label">pending</span>
        <code data-testid="detail-pending">{{ pending }}</code>
      </div>
      <div class="status-item">
        <span class="label">cache hit</span>
        <code data-testid="detail-cache-hit">{{ usedCachedPreview }}</code>
      </div>
      <div class="status-item">
        <span class="label">preview-only</span>
        <code data-testid="detail-preview-only">{{ showingPreviewOnly }}</code>
      </div>
    </section>

    <section v-if="!noteId" class="panel panel-error">
      <h2>Invalid slug</h2>
      <p>This demo expects a slug in the form <code>&lt;noteId&gt;--&lt;slugified-title&gt;</code>.</p>
    </section>

    <section v-else-if="error" class="panel panel-error">
      <h2>Detail query error</h2>
      <p>{{ error.message }}</p>
    </section>

    <article v-else-if="post" class="post-card">
      <div class="post-head">
        <div>
          <p v-if="showingPreviewOnly" class="preview-badge" data-testid="preview-badge">
            Showing cached title + description immediately
          </p>
          <p v-else class="live-badge" data-testid="live-badge">
            Full detail data loaded from Convex
          </p>
          <h2 data-testid="detail-title">{{ post.title }}</h2>
        </div>
        <div class="meta">
          <span>ID: {{ post.id }}</span>
          <span v-if="post.createdAt">Created: {{ new Date(post.createdAt).toLocaleString() }}</span>
        </div>
      </div>

      <section class="section">
        <h3>Description (card-sized data)</h3>
        <p data-testid="detail-description">{{ post.description }}</p>
      </section>

      <section class="section">
        <h3>Full Content</h3>
        <div v-if="post.content != null" class="content" data-testid="detail-content">
          {{ post.content }}
        </div>
        <div v-else class="content-loading" data-testid="detail-content-loading">
          Loading full content in the background...
        </div>
      </section>
    </article>

    <section v-else class="panel">
      <h2>Loading</h2>
      <p>Waiting for query result...</p>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: 900px;
  margin: 0 auto;
  padding: 12px 0 36px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.back-link {
  color: #2563eb;
  text-decoration: none;
  font-weight: 600;
}

.back-link:hover {
  text-decoration: underline;
}

.slug {
  background: #111827;
  color: #e5e7eb;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.8rem;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 14px;
}

.hero h1 {
  margin: 0 0 8px;
  font-size: 1.45rem;
}

.hero p {
  margin: 0;
  color: #4b5563;
  line-height: 1.45;
}

.status-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  margin-bottom: 14px;
}

.status-item {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 6px;
}

.status-item .label {
  color: #6b7280;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-item code {
  font-size: 0.95rem;
}

.panel {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
}

.panel h2 {
  margin: 0 0 8px;
  font-size: 1rem;
}

.panel p {
  margin: 0;
  color: #4b5563;
}

.panel-error {
  border-color: #fecaca;
  background: #fef2f2;
}

.panel-error p {
  color: #991b1b;
}

.post-card {
  border: 1px solid #dbeafe;
  background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
  border-radius: 14px;
  padding: 16px;
  display: grid;
  gap: 14px;
}

.post-head {
  display: grid;
  gap: 8px;
}

.post-head h2 {
  margin: 0;
  font-size: 1.3rem;
}

.meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: #6b7280;
  font-size: 0.85rem;
}

.preview-badge,
.live-badge {
  margin: 0;
  font-weight: 700;
  font-size: 0.82rem;
}

.preview-badge {
  color: #92400e;
}

.live-badge {
  color: #065f46;
}

.section {
  border-top: 1px solid #dbeafe;
  padding-top: 12px;
}

.section h3 {
  margin: 0 0 8px;
  font-size: 0.98rem;
}

.section p {
  margin: 0;
  color: #374151;
  line-height: 1.45;
}

.content {
  color: #111827;
  line-height: 1.55;
  white-space: pre-wrap;
}

.content-loading {
  border: 1px dashed #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 10px;
  padding: 10px;
}
</style>
