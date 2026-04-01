<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-4xl">
      <template #header>
        <div class="flex items-center gap-2">
          <NuxtLink to="/" class="text-sm text-muted hover:text-highlighted">&larr; Back</NuxtLink>
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
                <label class="text-sm font-medium text-highlighted">User auth ID</label>
                <UInput v-model="enrollForm.userId" placeholder="User auth ID" required />
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
                <UInput v-model="articleForm.body" required />
              </div>
              <div class="flex gap-3">
                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Visibility</label>
                  <USelect v-model="articleForm.visibility" :items="visibilityOptions" />
                </div>
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
          <div v-if="!articles?.length" class="text-sm text-muted py-4 text-center">
            No articles visible to you.
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <ArticleCard v-for="article in articles" :key="article._id" :article="article" />
          </div>
        </div>
      </ConvexAuthenticated>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'

import { api } from '~/convex/_generated/api'

const route = useRoute()
const kbId = route.params.kbId as string

const { can } = usePermissions()
const canManage = can('enrollment.manage')
const canCreateArticles = can('article.create')

const { data: kb } = await useConvexQuery(api.knowledgeBases.get, { id: kbId as any })
const { data: articles } = await useConvexQuery(api.articles.list, {
  knowledgeBaseId: kbId as any,
})

const publishKB = useConvexMutation(api.knowledgeBases.publish)
const seedArticles = useConvexMutation(api.articles.seedDemoArticles)
const enrollUser = useConvexMutation(api.knowledgeBases.enroll)
const createArticle = useConvexMutation(api.articles.create)

const enrollForm = reactive({ userId: '' })
const articleForm = reactive({
  title: '',
  body: '',
  visibility: 'workspace' as 'private' | 'team' | 'workspace',
})

const visibilityOptions = ['workspace', 'team', 'private'] as const

async function handlePublish() {
  await publishKB({ id: kbId as any })
}

async function handleSeed() {
  await seedArticles({ knowledgeBaseId: kbId as any })
}

async function handleEnroll() {
  await enrollUser({ knowledgeBaseId: kbId as any, userId: enrollForm.userId })
  enrollForm.userId = ''
}

async function handleCreateArticle() {
  await createArticle({
    knowledgeBaseId: kbId as any,
    title: articleForm.title,
    body: articleForm.body,
    visibility: articleForm.visibility,
  })
  articleForm.title = ''
  articleForm.body = ''
}
</script>
