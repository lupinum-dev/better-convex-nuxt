<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const name = ref('')
const { execute: createOrganization, pending } = useConvexMutation(api.organizations.create)

async function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName) return

  await createOrganization({ name: trimmedName })
  name.value = ''
}
</script>

<template>
  <form class="create-form" @submit.prevent="submit">
    <input v-model="name" placeholder="Organization name" />
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
