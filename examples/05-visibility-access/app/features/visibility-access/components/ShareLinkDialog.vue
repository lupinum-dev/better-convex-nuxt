<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">Create share link</h3>
      <p class="text-sm text-muted mt-1">Generate a link anyone can use to access this article.</p>
    </template>

    <form class="space-y-4" @submit.prevent="handleCreate">
      <div class="space-y-1">
        <label class="text-sm font-medium text-highlighted">Access level</label>
        <USelect v-model="level" :items="levelOptions" />
      </div>
      <div class="space-y-1">
        <label class="text-sm font-medium text-highlighted">Expires in</label>
        <USelect v-model="expiresIn" :items="expiryOptions" />
      </div>
      <UButton type="submit" block :loading="createToken.pending.value"> Generate link </UButton>
    </form>

    <div v-if="generatedToken" class="mt-4 space-y-2">
      <label class="text-sm font-medium text-highlighted">Share link</label>
      <div class="flex gap-2">
        <UInput :model-value="shareUrl" readonly class="flex-1" />
        <UButton color="neutral" variant="soft" @click="copyLink"> Copy </UButton>
      </div>
      <p class="text-xs text-muted">This link will only be shown once.</p>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

import { api } from '#trellis/api'
import type { Id } from '~/convex/_generated/dataModel'

const props = defineProps<{
  articleId: Id<'articles'>
}>()

const toast = useToast()
const level = ref<'view' | 'comment' | 'edit'>('view')
const expiresIn = ref('none')
const generatedToken = ref<string | null>(null)

const createToken = useConvexMutation(api.features.articles.domain.createShareToken, {
  onSuccess: () => toast.add({ title: 'Share link generated', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not create share link', description: error.message, color: 'error' }),
})

const levelOptions = ['view', 'comment', 'edit']
const expiryOptions = [
  { label: 'No expiry', value: 'none' },
  { label: '1 hour', value: '3600000' },
  { label: '24 hours', value: '86400000' },
  { label: '7 days', value: '604800000' },
]

const shareUrl = computed(() => {
  if (!generatedToken.value) return ''
  const base = window.location.origin
  return `${base}/articles/${props.articleId}?token=${generatedToken.value}`
})

async function handleCreate() {
  const expiresInMs = expiresIn.value !== 'none' ? Number(expiresIn.value) : undefined
  const token = await createToken({
    articleId: props.articleId,
    level: level.value,
    expiresInMs,
  })
  generatedToken.value = token
}

async function copyLink() {
  await navigator.clipboard.writeText(shareUrl.value)
  toast.add({ title: 'Link copied to clipboard', color: 'success' })
}
</script>
