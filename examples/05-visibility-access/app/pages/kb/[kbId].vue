<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-4xl">
      <template #header>
        <div class="flex items-center gap-2">
          <UButton to="/" variant="link" leading-icon="i-lucide-arrow-left" class="mb-2">
            Back to home
          </UButton>
        </div>
        <div class="flex items-center gap-3 mt-2">
          <h1 class="text-2xl font-bold">{{ kb?.title ?? 'Loading...' }}</h1>
          <UBadge
            v-if="kb"
            :color="kb.status === 'published' ? 'success' : 'warning'"
            variant="subtle"
            size="xs"
          >
            {{ kb.status }}
          </UBadge>
        </div>
      </template>

      <ConvexAuthenticated>
        <div class="space-y-4">
          <!-- Admin controls -->
          <div v-if="canManage" class="flex flex-wrap gap-2">
            <UButton
              v-if="kb?.status === 'draft'"
              color="success"
              variant="soft"
              leading-icon="i-lucide-check"
              :loading="publishKB.pending.value"
              @click="handlePublish"
            >
              Publish
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              leading-icon="i-lucide-database"
              :loading="seedArticles.pending.value"
              @click="handleSeed"
            >
              Seed demo articles
            </UButton>
          </div>

          <!-- Enrollment controls -->
          <UCard v-if="canManage">
            <template #header>
              <h3 class="text-base font-semibold">Enroll a user</h3>
            </template>

            <form class="flex gap-3 items-end" @submit.prevent="handleEnroll">
              <div class="flex-1 space-y-1">
                <label class="text-sm font-medium text-highlighted">User email</label>
                <UInput
                  v-model="enrollForm.email"
                  type="email"
                  placeholder="user@example.com"
                  required
                />
              </div>
              <UButton
                type="submit"
                :loading="enrollUser.pending.value"
                leading-icon="i-lucide-user-plus"
              >
                Enroll
              </UButton>
            </form>
          </UCard>

          <!-- Create article -->
          <UCard v-if="canCreateArticles">
            <template #header>
              <h3 class="text-base font-semibold">New article</h3>
            </template>

            <form class="space-y-3" @submit.prevent="handleCreateArticle">
              <div class="space-y-1">
                <label class="text-sm font-medium text-highlighted">Title</label>
                <UInput v-model="articleForm.title" required />
              </div>
              <div class="space-y-1">
                <label class="text-sm font-medium text-highlighted">Body</label>
                <UTextarea v-model="articleForm.body" :rows="3" required />
              </div>
              <div class="flex gap-3">
                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Visibility</label>
                  <USelect v-model="articleForm.visibility" :items="visibilityOptions" />
                </div>
                <div v-if="articles?.length" class="flex-1 space-y-1">
                  <label class="text-sm font-medium text-highlighted">Parent article</label>
                  <USelect
                    :model-value="articleForm.parentArticleId"
                    :items="parentArticleOptions"
                    placeholder="None"
                    @update:model-value="articleForm.parentArticleId = $event"
                  />
                </div>
              </div>
              <div class="space-y-1">
                <label class="text-sm font-medium text-highlighted"
                  >Internal notes (optional)</label
                >
                <UInput v-model="articleForm.internalNotes" placeholder="Visible to editors only" />
              </div>
              <UButton
                type="submit"
                :loading="createArticle.pending.value"
                leading-icon="i-lucide-plus"
              >
                Create article
              </UButton>
            </form>
          </UCard>

          <!-- Articles list -->
          <div v-if="!articles?.length" class="flex flex-col items-center gap-2 py-8 text-muted">
            <UIcon name="i-lucide-file-text" class="w-8 h-8" />
            <p class="text-sm">No articles visible to you.</p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <ArticleCard
              v-for="article in articles"
              :key="article._id"
              :article="article"
              :kb-id="kbId"
              :can-publish="canCreateArticles"
              @publish="handlePublishArticle"
            />
          </div>
        </div>
      </ConvexAuthenticated>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import ArticleCard from '~~/app/features/visibility-access/components/ArticleCard.vue'

import { api } from '#trellis/api'
import { articleCreate, enrollmentManage } from '#trellis/permissions'
import type { Id } from '~/convex/_generated/dataModel'

const route = useRoute()
const toast = useToast()
const kbId = route.params.kbId as Id<'knowledgeBases'>

const { can } = useAccess()
const canManage = can(enrollmentManage)
const canCreateArticles = can(articleCreate)

const { data: kb } = await useConvexQuery(api.features.knowledgeBases.domain.get, {
  id: kbId,
})
const { data: articles } = await useConvexQuery(api.features.articles.domain.list, {
  knowledgeBaseId: kbId,
})

const publishKB = useConvexMutation(api.features.knowledgeBases.domain.publish, {
  onSuccess: () => toast.add({ title: 'Knowledge base published', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not publish', description: error.message, color: 'error' }),
})
const seedArticles = useConvexMutation(api.features.articles.domain.seed, {
  onSuccess: () => toast.add({ title: 'Demo articles seeded', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not seed articles', description: error.message, color: 'error' }),
})
const enrollUser = useConvexMutation(api.features.knowledgeBases.domain.enrollByEmail, {
  onSuccess: () => toast.add({ title: 'User enrolled', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not enroll user', description: error.message, color: 'error' }),
})
const createArticle = useConvexMutation(api.features.articles.domain.create, {
  onSuccess: () => toast.add({ title: 'Article created', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not create article', description: error.message, color: 'error' }),
})
const publishArticle = useConvexMutation(api.features.articles.domain.publish, {
  onSuccess: () => toast.add({ title: 'Article published', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not publish article', description: error.message, color: 'error' }),
})

const enrollForm = reactive({ email: '' })
const articleForm = reactive({
  title: '',
  body: '',
  visibility: 'workspace' as 'private' | 'team' | 'workspace',
  parentArticleId: undefined as Id<'articles'> | undefined,
  internalNotes: '',
})

const visibilityOptions = ['workspace', 'team', 'private']
const parentArticleOptions = computed(() =>
  (articles.value ?? []).map((a) => ({ label: a.title, value: a._id })),
)

async function handlePublish() {
  await publishKB({ id: kbId })
}

async function handleSeed() {
  await seedArticles({ knowledgeBaseId: kbId })
}

async function handleEnroll() {
  await enrollUser({ knowledgeBaseId: kbId, email: enrollForm.email })
  enrollForm.email = ''
}

async function handlePublishArticle(articleId: string) {
  await publishArticle({ id: articleId as Id<'articles'> })
}

async function handleCreateArticle() {
  await createArticle({
    knowledgeBaseId: kbId,
    title: articleForm.title,
    body: articleForm.body,
    visibility: articleForm.visibility,
    parentArticleId: articleForm.parentArticleId,
    internalNotes: articleForm.internalNotes || undefined,
  })
  articleForm.title = ''
  articleForm.body = ''
  articleForm.internalNotes = ''
  articleForm.parentArticleId = undefined
}
</script>
