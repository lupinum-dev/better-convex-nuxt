<script setup lang="ts">
import { api } from '#convex/api'

const name = ref('')
const error = ref<string | null>(null)
const pending = ref(false)
const createOrganization = useConvexMutation(api.organizations.create)

async function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName) return

  pending.value = true
  error.value = null
  try {
    await createOrganization({
      name: trimmedName,
    })
    name.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Organization was not created'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <NameCreateForm
    v-model:name="name"
    :error="error"
    :pending="pending"
    placeholder="Organization name"
    @submit="submit"
  />
</template>
