<script setup lang="ts">
const name = ref('')
const error = ref<string | null>(null)
const pending = ref(false)
const authClient = useTeamAuthClient()

const emit = defineEmits<{
  created: []
}>()

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'organization'}-${Date.now().toString(36)}`
}

async function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName) return

  pending.value = true
  error.value = null
  try {
    const result = await authClient.organization.create({
      name: trimmedName,
      slug: slugify(trimmedName),
      plan: 'team',
      region: 'eu',
    })

    if (result.error) {
      error.value = result.error.message || 'Organization was not created'
      return
    }

    name.value = ''
    emit('created')
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
