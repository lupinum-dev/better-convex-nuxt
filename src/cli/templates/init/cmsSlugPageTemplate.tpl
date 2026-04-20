<script setup lang="ts">
import { api } from '#trellis/api'

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const pageArgs = computed(() => (slug.value ? { slug: slug.value } : undefined))
const { data: page } = await useConvexQuery(api.domain.pages.getPublished, pageArgs)
</script>

<template>
  <main style="max-width: 760px; margin: 0 auto; padding: 40px 16px; display: grid; gap: 16px;">
    <NuxtLink to="/">← Back</NuxtLink>

    <template v-if="page">
      <h1>{{ page.title }}</h1>
      <p style="white-space: pre-wrap;">{{ page.body }}</p>
    </template>

    <p v-else>Page not found.</p>
  </main>
</template>
