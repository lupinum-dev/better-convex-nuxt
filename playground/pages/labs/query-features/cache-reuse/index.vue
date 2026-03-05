<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import { getQueryKey } from 'better-convex-nuxt/composables'

definePageMeta({
  layout: 'sidebar',
})

type NoteListItem = {
  _id: string
  title?: string
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'note'
  )
}

function toExcerpt(value: string, max = 100): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max).trimEnd()}...`
}

function toSlugPath(note: Pick<NoteListItem, '_id' | 'title'>): string {
  return `${note._id}--${slugify(note.title ?? 'untitled')}`
}

const listCacheKey = getQueryKey(api.notes.list, {})

const { data: notes, pending, error, refresh } = await useConvexQuery(api.notes.list, {})

const { execute: addNote, pending: isCreating } = useConvexMutation(api.notes.add)

const cards = computed(() =>
  (notes.value ?? []).map((note) => ({
    id: note._id,
    slugPath: toSlugPath(note),
    title: note.title ?? 'Untitled',
    description: toExcerpt(note.content, 120),
    createdAt: note.createdAt,
    wordCount: note.content.trim().split(/\s+/).filter(Boolean).length,
  })),
)

async function seedDemoNotes() {
  const samples = [
    {
      title: 'Shipping a Better SSR Query Cache',
      content:
        'We split async-data cache identity from shared subscription identity so transformed and raw subscribers can coexist without clobbering each other. This keeps divergent transforms safe while preserving subscription deduplication.',
    },
    {
      title: 'Nuxt 4 + Convex Instant Navigation',
      content:
        'Use useNuxtData with getQueryKey to synchronously read list query results and seed a detail page default. Combine that with useConvexQuery so route navigation does not block while the full query fetches in the background.',
    },
    {
      title: 'Vue 3.5 Cleanup Patterns',
      content:
        'Prefer MaybeRefOrGetter and toValue for composables, add defineSlots for renderless UI components, and keep SSR context access above async boundaries. The result is cleaner code and fewer edge-case surprises.',
    },
  ]

  for (const sample of samples) {
    await addNote(sample)
  }
}
</script>

<template>
  <div class="page" data-testid="cache-reuse-list-page">
    <header class="hero">
      <div>
        <p class="eyebrow">Recipe Demo</p>
        <h1>List → Slug Detail Cache Reuse</h1>
        <p class="lead">
          Click a card to open a slug-style detail page. The detail page reuses the cached list data
          immediately (title + description), then fetches the full record in the background.
        </p>
      </div>

      <div class="hero-actions">
        <button class="btn" :disabled="pending" @click="refresh()">
          {{ pending ? 'Refreshing...' : 'Refresh List' }}
        </button>
        <button class="btn btn-primary" :disabled="isCreating" @click="seedDemoNotes">
          {{ isCreating ? 'Seeding...' : 'Seed Demo Notes' }}
        </button>
      </div>
    </header>

    <section class="panel">
      <h2>How this page sets up the cache</h2>
      <p>
        This page uses <code>useConvexQuery(api.notes.list, {})</code>. That populates Nuxt
        async-data cache under the key below, which the slug page reads using
        <code>useNuxtData(...)</code>.
      </p>
      <pre class="code" data-testid="cache-key">{{ listCacheKey }}</pre>
    </section>

    <section v-if="error" class="panel panel-error">
      <h2>Query Error</h2>
      <p>{{ error.message }}</p>
    </section>

    <section v-else-if="cards.length === 0" class="panel empty">
      <h2>No notes yet</h2>
      <p>Seed demo notes to try the instant cache-reuse navigation flow.</p>
    </section>

    <section v-else class="grid">
      <NuxtLink
        v-for="card in cards"
        :key="card.id"
        class="card"
        :to="`/labs/query-features/cache-reuse/${card.slugPath}`"
        :data-testid="`card-${card.id}`"
      >
        <div class="card-top">
          <h3>{{ card.title }}</h3>
          <span class="badge">{{ card.wordCount }} words</span>
        </div>
        <p class="card-desc">{{ card.description }}</p>
        <div class="card-footer">
          <span>{{ new Date(card.createdAt).toLocaleString() }}</span>
          <span class="link-label">Open slug page →</span>
        </div>
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: 980px;
  margin: 0 auto;
  padding: 12px 0 40px;
}

.hero {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0;
  color: #2563eb;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.78rem;
}

h1 {
  margin: 4px 0 10px;
  font-size: 1.85rem;
}

.lead {
  margin: 0;
  color: #4b5563;
  line-height: 1.5;
}

.hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.btn:disabled {
  cursor: default;
  opacity: 0.7;
}

.btn-primary {
  border-color: #2563eb;
  background: #2563eb;
  color: white;
}

.panel {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 16px;
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
  color: #991b1b;
}

.panel-error p {
  color: inherit;
}

.empty {
  text-align: center;
}

.code {
  margin: 10px 0 0;
  padding: 10px;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 0.84rem;
}

.grid {
  display: grid;
  gap: 12px;
}

.card {
  display: grid;
  gap: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  text-decoration: none;
  color: inherit;
  background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.card:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-top h3 {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.3;
}

.badge {
  border: 1px solid #dbeafe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.75rem;
  white-space: nowrap;
}

.card-desc {
  margin: 0;
  color: #4b5563;
  line-height: 1.45;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #6b7280;
  font-size: 0.84rem;
}

.link-label {
  color: #2563eb;
  font-weight: 600;
}
</style>
