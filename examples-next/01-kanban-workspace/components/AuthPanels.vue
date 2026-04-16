<template>
  <div class="auth-grid">
    <form class="stack" @submit.prevent="emit('signUp')">
      <h2>Create account</h2>
      <label>
        <span>Name</span>
        <input v-model="signUp.name" type="text" required />
      </label>
      <label>
        <span>Email</span>
        <input v-model="signUp.email" type="email" required />
      </label>
      <label>
        <span>Password</span>
        <input v-model="signUp.password" type="password" minlength="8" required />
      </label>
      <button type="submit" :disabled="pending">Sign up</button>
    </form>

    <form class="stack" @submit.prevent="emit('signIn')">
      <h2>Sign in</h2>
      <label>
        <span>Email</span>
        <input v-model="signIn.email" type="email" required />
      </label>
      <label>
        <span>Password</span>
        <input v-model="signIn.password" type="password" required />
      </label>
      <button type="submit" :disabled="pending">Sign in</button>
    </form>
  </div>
</template>

<script setup lang="ts">
const signUp = defineModel<{
  name: string
  email: string
  password: string
}>('signUp', { required: true })

const signIn = defineModel<{
  email: string
  password: string
}>('signIn', { required: true })

defineProps<{
  pending: boolean
}>()

const emit = defineEmits<{
  signUp: []
  signIn: []
}>()
</script>
