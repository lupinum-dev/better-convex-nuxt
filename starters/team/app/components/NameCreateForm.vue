<script setup lang="ts">
const name = defineModel<string>('name', { required: true })

const props = defineProps<{
  buttonLabel?: string
  disabled?: boolean
  error?: string | null
  pending?: boolean
  placeholder: string
}>()

const emit = defineEmits<{
  submit: []
}>()

const canSubmit = computed(() => !props.pending && !props.disabled && name.value.trim().length > 0)
</script>

<template>
  <form class="create-form" @submit.prevent="emit('submit')">
    <input v-model="name" :disabled="disabled" :placeholder="placeholder" />
    <button type="submit" :disabled="!canSubmit">
      {{ pending ? 'Creating...' : (buttonLabel ?? 'Create') }}
    </button>
    <p v-if="error" class="form-error">{{ error }}</p>
  </form>
</template>

<style scoped>
.create-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
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
  min-width: 0;
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

@media (max-width: 520px) {
  .create-form {
    grid-template-columns: 1fr;
  }

  button {
    width: fit-content;
  }
}
</style>
