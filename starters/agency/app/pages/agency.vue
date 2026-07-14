<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#convex/api'

defineOptions({ name: 'AgencyPage' })

const { isAuthenticated, isPending, user, signIn, signUp, signOut } = useConvexAuth()
const authMode = ref<'signUp' | 'signIn'>('signUp')
const name = ref('')
const email = ref('')
const password = ref('')
const authBusy = ref(false)
const authError = ref<string | null>(null)
const authNotice = ref<string | null>(null)
const agencyOrganizationId = ref('' as Id<'organizations'>)
const clientArgs = computed(() =>
  isAuthenticated.value && agencyOrganizationId.value
    ? { agencyOrganizationId: agencyOrganizationId.value }
    : 'skip',
)
const { data: clients } = await useConvexQuery(api.organizationLinks.listClients, clientArgs)

async function submitAuth() {
  if (password.value.length < 15 || !email.value.trim()) return
  if (authMode.value === 'signUp' && !name.value.trim()) return

  authBusy.value = true
  authError.value = null
  authNotice.value = null
  try {
    const signingUp = authMode.value === 'signUp'
    const result = signingUp
      ? await signUp.email({
          name: name.value.trim(),
          email: email.value.trim().toLowerCase(),
          password: password.value,
        })
      : await signIn.email({
          email: email.value.trim().toLowerCase(),
          password: password.value,
        })

    if (result.error) {
      throw new Error(signingUp ? 'Sign up could not be completed' : 'Invalid email or password')
    }
    password.value = ''
    if (signingUp) {
      authMode.value = 'signIn'
      authNotice.value = 'Account request complete. Sign in with your credentials.'
    }
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Authentication failed'
  } finally {
    authBusy.value = false
  }
}

async function handleSignOut() {
  await signOut()
  agencyOrganizationId.value = '' as Id<'organizations'>
}
</script>

<template>
  <main class="shell">
    <p>Agency starter</p>
    <h1>Client workspaces</h1>

    <p v-if="!isAuthenticated && isPending">Checking session...</p>

    <form v-else-if="!isAuthenticated" class="auth-panel" @submit.prevent="submitAuth">
      <div class="auth-modes" aria-label="Authentication mode">
        <button type="button" @click="authMode = 'signUp'">Create account</button>
        <button type="button" @click="authMode = 'signIn'">Sign in</button>
      </div>
      <label v-if="authMode === 'signUp'">
        Name
        <input v-model="name" autocomplete="name" required />
      </label>
      <label>
        Email
        <input v-model="email" autocomplete="email" type="email" required />
      </label>
      <label>
        Password
        <input
          v-model="password"
          :autocomplete="authMode === 'signIn' ? 'current-password' : 'new-password'"
          minlength="15"
          type="password"
          required
        />
      </label>
      <p v-if="authNotice" class="notice">{{ authNotice }}</p>
      <p v-if="authError" class="error">{{ authError }}</p>
      <button :disabled="authBusy" type="submit">
        {{ authBusy ? 'Working...' : authMode === 'signUp' ? 'Create account' : 'Sign in' }}
      </button>
    </form>

    <template v-else>
      <div class="session-row">
        <span>{{ user?.email ?? 'Signed in' }}</span>
        <button type="button" @click="handleSignOut">Sign out</button>
      </div>

      <label>
        Agency organization id
        <input v-model="agencyOrganizationId" placeholder="Paste an agency organization id" />
      </label>

      <nav class="list">
        <NuxtLink
          v-for="client in clients ?? []"
          :key="client.id"
          :to="`/clients/${client.id}?agencyOrganizationId=${agencyOrganizationId}`"
        >
          {{ client.name }}
        </NuxtLink>
      </nav>
    </template>
  </main>
</template>

<style>
body {
  margin: 0;
  background: #f8fafc;
  color: #18181b;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

.shell {
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 24px;
}

.auth-panel {
  display: grid;
  gap: 12px;
  max-width: 440px;
}

.auth-modes,
.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid #d6dae1;
  border-radius: 6px;
  background: white;
  font: inherit;
  cursor: pointer;
}

.error {
  color: #b42318;
}

.notice {
  color: #475467;
}

input {
  display: block;
  width: 100%;
  height: 40px;
  margin: 8px 0 20px;
  padding: 0 12px;
  border: 1px solid #d6dae1;
  border-radius: 6px;
  font: inherit;
}

.list {
  display: grid;
  gap: 8px;
}

.list a {
  padding: 14px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: white;
  color: inherit;
  text-decoration: none;
}
</style>
