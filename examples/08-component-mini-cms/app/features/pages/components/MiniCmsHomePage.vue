<template>
  <div class="mini-shell">
    <div class="mini-frame">
      <header class="mini-hero">
        <p class="mini-kicker">Example 08</p>
        <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div class="max-w-3xl space-y-3">
            <h1 class="text-5xl font-semibold">Local component mini CMS</h1>
            <p class="text-lg text-[var(--mini-muted)]">
              Public readers stay on the root app. Drafts, publish rules, and preview all live
              inside the local Convex component.
            </p>
          </div>

          <div class="flex gap-3">
            <UButton to="/studio" color="neutral" variant="soft" trailing-icon="i-lucide-pencil">
              Open studio
            </UButton>
            <UButton to="/mcp" color="primary" variant="soft" trailing-icon="i-lucide-bot">
              Optional MCP view
            </UButton>
          </div>
        </div>
      </header>

      <section class="mini-panel p-5">
        <div class="grid gap-3 lg:grid-cols-3">
          <div class="rounded-2xl border border-default p-4">
            <p class="mini-kicker">1. Host app</p>
            <p class="mt-2 text-sm text-[var(--mini-muted)]">
              Public reads stay in the root app and expose only the published surface.
            </p>
          </div>
          <div class="rounded-2xl border border-default p-4">
            <p class="mini-kicker">2. Component boundary</p>
            <p class="mt-2 text-sm text-[var(--mini-muted)]">
              Draft creation, editing, and publish rules live behind the local component boundary.
            </p>
          </div>
          <div class="rounded-2xl border border-default p-4">
            <p class="mini-kicker">3. Optional MCP projection</p>
            <p class="mt-2 text-sm text-[var(--mini-muted)]">
              MCP is secondary here. It only proves that the same bridge-backed operations can be
              projected outward after the boundary is established.
            </p>
          </div>
        </div>
      </section>

      <div class="mini-grid">
        <section class="mini-panel p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-2xl font-semibold">Published pages</h2>
              <p class="mt-2 text-sm text-[var(--mini-muted)]">
                Anonymous callers only see this public read surface.
              </p>
            </div>
            <span class="mini-code">caller: anonymous | user</span>
          </div>

          <div v-if="pending" class="mt-6 space-y-3">
            <USkeleton v-for="n in 3" :key="n" class="h-20 w-full rounded-2xl" />
          </div>

          <div v-else-if="publishedPages?.length" class="mt-6 space-y-3">
            <button
              v-for="page in publishedPages"
              :key="page._id"
              class="mini-list-item block w-full text-left"
              :data-active="page.slug === selectedSlug"
              @click="selectedSlug = page.slug"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-lg font-semibold">{{ page.title }}</p>
                  <p class="mt-1 text-sm text-[var(--mini-muted)]">/{{ page.slug }}</p>
                </div>
                <UBadge color="neutral" variant="soft">
                  {{ page.status }}
                </UBadge>
              </div>
            </button>
          </div>

          <p v-else class="mt-6 text-sm text-[var(--mini-muted)]">
            Publish a page from the studio to make it visible here.
          </p>
        </section>

        <section class="mini-panel p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="mini-kicker">Public preview</p>
              <h2 class="mt-2 text-3xl font-semibold">
                {{ selectedPage?.title || 'No published page yet' }}
              </h2>
            </div>
            <span v-if="selectedPage" class="mini-code">/{{ selectedPage.slug }}</span>
          </div>

          <div v-if="pagePending" class="mt-6 space-y-3">
            <USkeleton class="h-10 w-48 rounded-xl" />
            <USkeleton class="h-36 w-full rounded-2xl" />
          </div>

          <template v-else-if="selectedPage">
            <p class="mt-3 text-sm text-[var(--mini-muted)]">
              Published {{ formatDate(selectedPage.publishedAt) }} · Author
              {{ selectedPage.authorId }}
            </p>
            <article class="mini-prose mt-6 text-base">
              {{ selectedPage.body }}
            </article>
          </template>

          <p v-else class="mt-6 text-sm text-[var(--mini-muted)]">
            There is no public content yet. Sign into the studio, create a draft, and publish it.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { api } from '#trellis/api'

const { data: publishedPages, pending } = await useConvexQuery(
  api.features.pages.domain.listPublished,
  {},
)

const selectedSlug = ref<string | undefined>()

watch(
  publishedPages,
  (pages) => {
    if (!pages?.length) {
      selectedSlug.value = undefined
      return
    }

    if (
      !selectedSlug.value ||
      !pages.some((page: { slug: string }) => page.slug === selectedSlug.value)
    ) {
      selectedSlug.value = pages[0]?.slug
    }
  },
  { immediate: true },
)

const pageArgs = computed(() => (selectedSlug.value ? { slug: selectedSlug.value } : undefined))
const { data: selectedPage, pending: pagePending } = await useConvexQuery(
  api.features.pages.domain.getPublished,
  pageArgs,
)

function formatDate(value: number | null) {
  if (!value) return 'just now'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}
</script>
