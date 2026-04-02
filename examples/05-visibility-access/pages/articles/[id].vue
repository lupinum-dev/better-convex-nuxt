<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-3xl">
      <template #header>
        <NuxtLink to="/" class="text-sm text-muted hover:text-highlighted">&larr; Back</NuxtLink>
        <div class="flex items-center gap-3 mt-2">
          <h1 class="text-2xl font-bold">{{ article?.title ?? 'Loading...' }}</h1>
          <AccessBadge v-if="article" :level="article._access" />
        </div>
      </template>

      <div v-if="error" class="space-y-3">
        <UAlert color="error" :title="error.message" />
        <p class="text-sm text-muted">
          You may need enrollment, to complete a prerequisite, or to use a share link.
        </p>
      </div>

      <div v-else-if="article" class="space-y-4">
        <div class="prose dark:prose-invert max-w-none">
          <p>{{ article.body }}</p>
        </div>

        <!-- Internal notes (only visible to editors+) -->
        <UCard v-if="article.internalNotes" variant="subtle">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-eye-off" class="w-4 h-4" />
              <span class="text-sm font-semibold">Internal notes</span>
            </div>
          </template>
          <p class="text-sm">{{ article.internalNotes }}</p>
        </UCard>

        <!-- Actions -->
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="article._access !== 'edit'"
            color="success"
            variant="soft"
            leading-icon="i-lucide-check-circle"
            :loading="markCompleted.pending.value"
            @click="handleComplete"
          >
            Mark as completed
          </UButton>
        </div>

        <!-- Share link creation (editors+) -->
        <ShareLinkDialog v-if="canShare" :article-id="articleId" />
      </div>

      <div v-else>
        <USkeleton class="h-32 w-full rounded-xl" />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { api } from '~/convex/_generated/api'
import { knowledgeBasePermissionKeys } from '~/shared/permissions'

const route = useRoute()
const articleId = route.params.id as string
const shareToken = route.query.token as string | undefined

const { can } = usePermissions()
const canShare = can(knowledgeBasePermissionKeys.shareCreate)

const { data: article, error } = await useConvexQuery(
  api.articles.viewArticle,
  computed(() => ({
    id: articleId as any,
    shareToken: shareToken || undefined,
  })),
)

const markCompleted = useConvexMutation(api.articles.markCompleted)

async function handleComplete() {
  await markCompleted({ articleId: articleId as any })
}
</script>
