<template>
  <div class="grid gap-4 md:grid-cols-2">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">Create client workspace</h3>
      </template>

      <form class="space-y-4" @submit.prevent="handleCreate">
        <div class="space-y-1">
          <label class="text-sm font-medium text-highlighted">Workspace name</label>
          <UInput v-model="createForm.name" required />
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium text-highlighted">Slug</label>
          <UInput v-model="createForm.slug" required />
        </div>
        <UButton type="submit" block :loading="createWorkspace.pending.value">
          Create workspace
        </UButton>
      </form>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">Join client workspace</h3>
      </template>

      <form class="space-y-4" @submit.prevent="handleJoin">
        <div class="space-y-1">
          <label class="text-sm font-medium text-highlighted">Workspace slug</label>
          <UInput v-model="joinForm.slug" required />
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium text-highlighted">Role</label>
          <USelect v-model="joinForm.role" :items="roleOptions" />
        </div>
        <UButton
          type="submit"
          block
          color="neutral"
          variant="soft"
          :loading="joinWorkspace.pending.value"
        >
          Join workspace
        </UButton>
      </form>
    </UCard>
  </div>

  <UCard v-if="workspaces?.length">
    <template #header>
      <h3 class="text-lg font-semibold">Existing workspaces</h3>
      <p class="text-sm text-muted mt-1">Available workspaces you can join by slug.</p>
    </template>

    <ul class="space-y-2">
      <li
        v-for="ws in workspaces"
        :key="ws._id"
        class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-default bg-elevated"
      >
        <span class="font-medium text-highlighted">{{ ws.name }}</span>
        <span class="text-sm text-muted font-mono">{{ ws.slug }}</span>
      </li>
    </ul>
  </UCard>

  <UAlert
    color="info"
    variant="subtle"
    icon="i-lucide-lightbulb"
    title="Multi-workspace tip"
    description="Open a second browser or incognito window and join the same workspace with a different role to see multi-workspace in action."
  />
</template>

<script setup lang="ts">
import { reactive } from 'vue'

import { api } from '#trellis/api'

const toast = useToast()

const createForm = reactive({ name: '', slug: '' })
const joinForm = reactive({
  slug: '',
  role: 'member' as 'owner' | 'member' | 'viewer' | 'agency_admin' | 'agency_manager',
})

const roleOptions = [
  { label: 'Owner (full access)', value: 'owner' },
  { label: 'Member (create projects)', value: 'member' },
  { label: 'Viewer (read only)', value: 'viewer' },
  { label: 'Agency Admin (cross-client dashboard)', value: 'agency_admin' },
  { label: 'Agency Manager (cross-client dashboard)', value: 'agency_manager' },
]

const createWorkspace = useConvexMutation(api.workspaces.createWorkspace, {
  onSuccess: () => toast.add({ title: 'Workspace created', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not create workspace', description: error.message, color: 'error' }),
})
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace, {
  onSuccess: () => toast.add({ title: 'Joined workspace', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not join workspace', description: error.message, color: 'error' }),
})

const { data: workspaces } = await useConvexQuery(api.workspaces.listWorkspaces, {})

async function handleCreate() {
  await createWorkspace(createForm)
}

async function handleJoin() {
  await joinWorkspace(joinForm)
}
</script>
