<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#convex/api'

const props = defineProps<{
  organizationId: Id<'organizations'>
}>()

const name = ref('')
const error = ref<string | null>(null)
const createProject = useConvexMutation(api.projects.create)
const pending = createProject.pending

async function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName) return

  error.value = null
  try {
    await createProject({ organizationId: props.organizationId, name: trimmedName })
    name.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Project was not created'
  }
}
</script>

<template>
  <NameCreateForm
    v-model:name="name"
    :error="error"
    :pending="pending"
    placeholder="Project name"
    @submit="submit"
  />
</template>
