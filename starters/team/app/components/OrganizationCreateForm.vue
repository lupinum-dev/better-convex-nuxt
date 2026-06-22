<script setup lang="ts">
import { api } from '#convex/api'

const name = ref('')
const error = ref<string | null>(null)
const createOrganization = useConvexMutation(api.organizations.create)
const pending = createOrganization.pending

async function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName) return

  error.value = null
  try {
    await createOrganization({ name: trimmedName })
    name.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Organization was not created'
  }
}
</script>

<template>
  <form class="create-form" @submit.prevent="submit">
    <input v-model="name" placeholder="Organization name" />
    <button :disabled="pending || !name.trim()">Create</button>
    <p v-if="error" class="form-error">{{ error }}</p>
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

.form-error {
  grid-column: 1 / -1;
  margin: 0;
  color: #b42318;
  font-size: 14px;
}
</style>
