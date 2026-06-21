<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#convex/api'

const props = defineProps<{
  organizationId: Id<'organizations'>
}>()

const name = ref('')
const createProject = useConvexMutation(api.projects.create)
const pending = createProject.pending

async function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName) return

  await createProject({ organizationId: props.organizationId, name: trimmedName })
  name.value = ''
}
</script>

<template>
  <form class="create-form" @submit.prevent="submit">
    <input v-model="name" placeholder="Project name" />
    <button :disabled="pending || !name.trim()">Create</button>
  </form>
</template>

<style scoped>
.create-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-bottom: 20px;
}

input,
button {
  height: 40px;
  border: 1px solid #d6dae1;
  border-radius: 6px;
  font: inherit;
}

input {
  padding: 0 12px;
  background: white;
}

button {
  padding: 0 14px;
  background: #18181b;
  color: white;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
