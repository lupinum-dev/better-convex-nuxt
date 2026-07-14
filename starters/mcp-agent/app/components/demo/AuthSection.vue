<script setup lang="ts">
const mode = defineModel<'signUp' | 'signIn'>('mode', { required: true })
const name = defineModel<string>('name', { required: true })
const email = defineModel<string>('email', { required: true })
const password = defineModel<string>('password', { required: true })

defineProps<{
  authBusy: boolean
  canSubmitAuth: boolean
  authSubmitLabel: string
  passwordAutocomplete: string
  authFormError: string | null
  authError?: string | null
  authMessage: string | null
}>()

defineEmits<{
  submit: []
}>()
</script>

<template>
  <section class="section-grid auth-layout">
    <div class="intro-copy">
      <p class="eyebrow">Complete flow</p>
      <h2>Sign in, create an org, mint a service actor, then call MCP.</h2>
      <p>
        Humans and service actors use the same project domain operations behind separate
        authorization wrappers. MCP stays transport-only.
      </p>
    </div>

    <form class="panel auth-panel" data-testid="auth-form" @submit.prevent="$emit('submit')">
      <div class="segmented" aria-label="Authentication mode">
        <button type="button" :class="{ active: mode === 'signUp' }" @click="mode = 'signUp'">
          Sign up
        </button>
        <button type="button" :class="{ active: mode === 'signIn' }" @click="mode = 'signIn'">
          Sign in
        </button>
      </div>

      <label v-if="mode === 'signUp'">
        Name
        <input v-model="name" autocomplete="name" data-testid="auth-name" required />
      </label>

      <label>
        Email
        <input
          v-model="email"
          autocomplete="email"
          data-testid="auth-email"
          required
          type="email"
        />
      </label>

      <label>
        Password
        <input
          v-model="password"
          :autocomplete="passwordAutocomplete"
          data-testid="auth-password"
          minlength="15"
          required
          type="password"
        />
      </label>

      <p v-if="authFormError || authError" class="error-text" data-testid="auth-error">
        {{ authFormError || authError }}
      </p>
      <p v-if="authMessage" class="success-text" data-testid="auth-message">
        {{ authMessage }}
      </p>

      <button
        class="primary-button"
        data-testid="auth-submit"
        :disabled="authBusy || !canSubmitAuth"
      >
        {{ authSubmitLabel }}
      </button>
    </form>
  </section>
</template>
