<script setup lang="ts">
const { message } = defineProps<{
  message: string
}>()

const { signIn, signUp, refreshAuth } = useConvexAuth()

const mode = ref<'signIn' | 'signUp'>('signUp')
const name = ref('')
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

const canSubmit = computed(() => {
  if (!email.value.trim() || password.value.length < 8) return false
  return mode.value === 'signIn' || !!name.value.trim()
})

const submitLabel = computed(() => {
  if (loading.value) return mode.value === 'signIn' ? 'Signing in...' : 'Creating account...'
  return mode.value === 'signIn' ? 'Sign in' : 'Create account'
})
const passwordAutocomplete = computed(() =>
  mode.value === 'signIn' ? 'current-password' : 'new-password',
)

watch(mode, () => {
  error.value = null
})

async function submitAuth() {
  if (!canSubmit.value) return

  loading.value = true
  error.value = null
  const trimmedEmail = email.value.trim()

  try {
    if (mode.value === 'signUp') {
      const { error: signUpError } = await signUp.email({
        name: name.value.trim(),
        email: trimmedEmail,
        password: password.value,
      })

      if (signUpError) {
        error.value = signUpError.message || 'Sign up failed'
        return
      }
    }

    const result = await signIn.email({
      email: trimmedEmail,
      password: password.value,
    })

    if (result.error) {
      error.value = result.error.message || 'Sign in failed'
      return
    }

    password.value = ''
    await refreshAuth()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Authentication failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth-panel">
    <strong>Signed out</strong>
    <span>{{ message }}</span>

    <div class="mode-toggle" aria-label="Authentication mode">
      <button type="button" :class="{ active: mode === 'signUp' }" @click="mode = 'signUp'">
        Sign up
      </button>
      <button type="button" :class="{ active: mode === 'signIn' }" @click="mode = 'signIn'">
        Sign in
      </button>
    </div>

    <form class="auth-form" @submit.prevent="submitAuth">
      <label v-if="mode === 'signUp'">
        Name
        <input v-model="name" autocomplete="name" placeholder="Your name" required />
      </label>

      <label>
        Email
        <input
          v-model="email"
          autocomplete="email"
          placeholder="you@example.com"
          required
          type="email"
        />
      </label>

      <label>
        Password
        <input
          v-model="password"
          :autocomplete="passwordAutocomplete"
          minlength="8"
          placeholder="Min 8 characters"
          required
          type="password"
        />
      </label>

      <p v-if="error" class="auth-error">{{ error }}</p>

      <button type="submit" :disabled="loading || !canSubmit">
        {{ submitLabel }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.auth-panel {
  display: grid;
  gap: 12px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: white;
  color: #475569;
}

.auth-panel strong {
  color: #18181b;
}

.mode-toggle {
  display: flex;
  width: fit-content;
  gap: 4px;
  padding: 4px;
  border: 1px solid #d6dae1;
  border-radius: 8px;
  background: #f7f8fb;
}

.mode-toggle button,
.auth-form button {
  height: 36px;
  border: 1px solid transparent;
  border-radius: 6px;
  font: inherit;
}

.mode-toggle button {
  padding: 0 12px;
  background: transparent;
  color: #475569;
}

.mode-toggle button.active,
.auth-form button {
  background: #18181b;
  color: white;
}

.auth-form {
  display: grid;
  gap: 10px;
  max-width: 360px;
}

.auth-form label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 14px;
}

.auth-form input {
  height: 38px;
  padding: 0 10px;
  border: 1px solid #d6dae1;
  border-radius: 6px;
  background: white;
  font: inherit;
}

.auth-form button {
  width: fit-content;
  padding: 0 14px;
}

.auth-form button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.auth-error {
  margin: 0;
}

.auth-error {
  color: #b42318;
}
</style>
