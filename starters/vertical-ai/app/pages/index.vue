<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#convex/api'

const organizationId = ref('' as Id<'organizations'>)
const { data: records } = await useConvexQuery(api.domainRecords.list, { organizationId })
</script>

<template>
  <main class="shell">
    <p>Vertical AI starter</p>
    <h1>Approved records</h1>

    <label>
      Organization id
      <input v-model="organizationId" placeholder="Paste an organization id" />
    </label>

    <NuxtLink to="/drafts">Review drafts</NuxtLink>

    <ul>
      <li v-for="record in records ?? []" :key="record._id">
        <strong>{{ record.title }}</strong>
        <p>{{ record.body }}</p>
      </li>
    </ul>
  </main>
</template>

<style>
body {
  margin: 0;
  background: #f8fafc;
  color: #18181b;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

.shell {
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 24px;
}

input {
  display: block;
  width: 100%;
  height: 40px;
  margin: 8px 0 20px;
  padding: 0 12px;
  border: 1px solid #d6dae1;
  border-radius: 6px;
  font: inherit;
}
</style>
