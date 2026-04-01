<template>
  <NuxtLink
    :to="`/articles/${article._id}`"
    class="block rounded-xl border border-default bg-elevated p-4 hover:border-primary transition-colors"
  >
    <div class="flex items-center gap-2">
      <p class="font-semibold text-highlighted">{{ article.title }}</p>
      <UBadge :color="visibilityColor" variant="subtle" size="xs">
        {{ article.visibility }}
      </UBadge>
      <UBadge v-if="article.status === 'draft'" color="warning" variant="subtle" size="xs">
        draft
      </UBadge>
    </div>
    <p class="text-sm text-muted mt-1 line-clamp-2">{{ article.body }}</p>
    <div
      v-if="article.prerequisiteIds?.length"
      class="flex items-center gap-1 mt-2 text-xs text-muted"
    >
      <UIcon name="i-lucide-lock" class="w-3 h-3" />
      <span
        >{{ article.prerequisiteIds.length }} prerequisite{{
          article.prerequisiteIds.length > 1 ? 's' : ''
        }}</span
      >
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
const props = defineProps<{
  article: {
    _id: string
    title: string
    body: string
    status: string
    visibility: string
    prerequisiteIds?: string[]
  }
}>()

const visibilityColor = computed(() => {
  switch (props.article.visibility) {
    case 'workspace':
      return 'success'
    case 'team':
      return 'info'
    case 'private':
      return 'warning'
    default:
      return 'neutral'
  }
})
</script>
