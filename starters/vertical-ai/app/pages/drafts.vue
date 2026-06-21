<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const organizationId = ref('' as Id<'organizations'>)
const { data: drafts } = await useConvexQuery(api.drafts.listPending, { organizationId })
const { execute: approveDraft } = useConvexMutation(api.approvals.approveDraft)
const { execute: rejectDraft } = useConvexMutation(api.approvals.rejectDraft)
</script>

<template>
  <main class="shell">
    <NuxtLink to="/">Records</NuxtLink>
    <h1>Draft review</h1>

    <label>
      Organization id
      <input v-model="organizationId" placeholder="Paste an organization id" />
    </label>

    <article v-for="draft in drafts ?? []" :key="draft._id">
      <h2>{{ draft.title }}</h2>
      <p>{{ draft.body }}</p>
      <button @click="approveDraft({ organizationId, draftId: draft._id })">Approve</button>
      <button @click="rejectDraft({ organizationId, draftId: draft._id })">Reject</button>
    </article>
  </main>
</template>

