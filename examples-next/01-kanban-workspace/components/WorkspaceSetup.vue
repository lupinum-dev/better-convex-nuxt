<template>
  <div class="workspace-grid">
    <form class="stack" @submit.prevent="emit('create')">
      <h2>Create workspace</h2>
      <label>
        <span>Name</span>
        <input v-model="createForm.name" type="text" required />
      </label>
      <label>
        <span>Slug</span>
        <input v-model="createForm.slug" type="text" required />
      </label>
      <button type="submit" :disabled="createPending">Create workspace</button>
    </form>

    <form class="stack" @submit.prevent="emit('join')">
      <h2>Join workspace</h2>
      <label>
        <span>Workspace slug</span>
        <input v-model="joinForm.slug" type="text" required />
      </label>
      <label>
        <span>Role</span>
        <select v-model="joinForm.role">
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="viewer">viewer</option>
        </select>
      </label>
      <button type="submit" :disabled="joinPending">Join workspace</button>
    </form>

    <div class="stack" v-if="workspaces.length">
      <h2>Known workspaces</h2>
      <ul class="stack">
        <li v-for="workspace in workspaces" :key="workspace._id">
          <span>{{ workspace.name }}</span>
          <span class="meta mono">{{ workspace.slug }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  createPending: boolean
  joinPending: boolean
  workspaces: Array<{ _id: string; name: string; slug: string }>
}>()

const createForm = defineModel<{
  name: string
  slug: string
}>('createForm', { required: true })

const joinForm = defineModel<{
  slug: string
  role: 'admin' | 'member' | 'viewer'
}>('joinForm', { required: true })

const emit = defineEmits<{
  create: []
  join: []
}>()
</script>

