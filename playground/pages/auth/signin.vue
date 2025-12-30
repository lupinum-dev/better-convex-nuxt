<template>
  <div class="container">
    <div class="card">
      <h1>Welcome Back</h1>
      <p class="subtitle">Sign in to your account</p>

      <form class="form" @submit.prevent="handleSignIn">
        <div class="field">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            placeholder="you@example.com"
            required
          />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            placeholder="Your password"
            required
          />
        </div>

        <div v-if="error" class="error">
          {{ error }}
        </div>

        <button type="submit" class="btn btn-primary" :disabled="isLoading">
          {{ isLoading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>

      <p class="footer">
        Don't have an account?
        <NuxtLink to="/auth/signup">Create one</NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const authClient = useAuthClient()

const form = reactive({
  email: '',
  password: '',
})

const isLoading = ref(false)
const error = ref<string | null>(null)

async function handleSignIn() {
  if (!authClient) {
    error.value = 'Auth client not available'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const result = await authClient.signIn.email({
      email: form.email,
      password: form.password,
    })

    if (result.error) {
      error.value = result.error.message || 'Invalid email or password'
      return
    }

    window.location.href = '/'
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'An unexpected error occurred'
  }
  finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 40px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
  text-align: center;
}

.subtitle {
  color: #666;
  margin-bottom: 24px;
  text-align: center;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #374151;
}

input {
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.error {
  background: #fef2f2;
  color: #dc2626;
  padding: 12px;
  border-radius: 8px;
  font-size: 0.9rem;
}

.btn {
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.footer {
  margin-top: 24px;
  text-align: center;
  color: #666;
  font-size: 0.9rem;
}

.footer a {
  color: #3b82f6;
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}
</style>
