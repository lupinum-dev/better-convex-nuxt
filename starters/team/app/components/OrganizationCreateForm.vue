<script setup lang="ts">
const name = ref('')
const error = ref<string | null>(null)
const pending = ref(false)

const emit = defineEmits<{
  created: []
}>()

async function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName) return

  pending.value = true
  error.value = null
  try {
    await $fetch('/api/organizations', {
      method: 'POST',
      body: {
        name: trimmedName,
      },
    })

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
