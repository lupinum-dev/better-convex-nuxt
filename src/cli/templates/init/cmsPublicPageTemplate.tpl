<script setup lang="ts">
import { api } from '#trellis/api'

const { data: pages } = await useConvexQuery(api.features.pages.domain.listPublished, {})
</script>

<template>
  <main style="max-width: 760px; margin: 0 auto; padding: 40px 16px; display: grid; gap: 20px;">
    <header style="display: grid; gap: 8px;">
      <h1>CMS Starter</h1>
      <p>Public published pages on the left, signed-in studio at <code>/studio</code>.</p>
      <NuxtLink to="/studio">Open studio</NuxtLink>
    </header>

    <ul style="display: grid; gap: 12px; padding-left: 20px;">
      <li v-for="page in pages ?? []" :key="page._id">
        <NuxtLink :to="`/${page.slug}`">{{ page.title }}</NuxtLink>
      </li>
    </ul>
  </main>
</template>
