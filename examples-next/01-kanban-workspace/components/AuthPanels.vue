<template>
  <div class="auth-grid">
    <form class="card stack" @submit.prevent="emit('signUp')">
      <div class="stack-sm">
        <h2>Create account</h2>
        <p class="meta">New to this workspace? Start here.</p>
      </div>
      <label>
        <span>Name</span>
        <input v-model="signUp.name" type="text" autocomplete="name" required />
      </label>
      <label>
        <span>Email</span>
        <input
          v-model="signUp.email"
          type="email"
          autocomplete="email"
          aria-describedby="signup-email-hint"
          required
        />
        <span id="signup-email-hint" class="field-hint">Used as your sign-in identifier.</span>
      </label>
      <label>
        <span>Password</span>
        <input
          v-model="signUp.password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          aria-describedby="signup-password-hint"
          required
        />
        <span id="signup-password-hint" class="field-hint">At least 8 characters.</span>
      </label>
      <div>
        <button type="submit" class="btn btn--primary" :disabled="pending">
          <span v-if="pending" class="spinner spinner--inline" aria-hidden="true" />
          Sign up
        </button>
      </div>
    </form>

    <form class="card stack" @submit.prevent="emit('signIn')">
      <div class="stack-sm">
        <h2>Sign in</h2>
        <p class="meta">Already have an account?</p>
      </div>
      <label>
        <span>Email</span>
        <input v-model="signIn.email" type="email" autocomplete="email" required />
      </label>
      <label>
        <span>Password</span>
        <input
          v-model="signIn.password"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>
      <div>
        <button type="submit" class="btn btn--primary" :disabled="pending">
          <span v-if="pending" class="spinner spinner--inline" aria-hidden="true" />
          Sign in
        </button>
      </div>
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
