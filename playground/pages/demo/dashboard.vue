<template>
  <div class="container">
    <div class="card">
      <header class="header">
        <h1>Dashboard</h1>
        <button class="btn-signout" :disabled="isSigningOut" @click="handleSignOut">
          {{ isSigningOut ? '...' : 'Sign Out' }}
        </button>
      </header>

      <!-- Loading state -->
      <div v-if="isPending || isLoadingUser" class="loading">Loading...</div>

      <!-- Not authenticated -->
      <div v-else-if="!isAuthenticated" class="not-auth">
        <p>You need to sign in to view this page.</p>
        <NuxtLink to="/auth/signin" class="btn btn-primary"> Sign In </NuxtLink>
      </div>

      <!-- Authenticated content -->
      <div v-else class="content">
        <section class="section">
          <h2>Your Profile</h2>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Name</span>
              <span class="value">{{ user?.displayName || 'Not set' }}</span>
            </div>
            <div class="info-item">
              <span class="label">Email</span>
              <span class="value">{{ user?.email }}</span>
            </div>
            <div class="info-item">
              <span class="label">User ID</span>
              <span class="value id">{{ user?._id }}</span>
            </div>
            <div class="info-item">
              <span class="label">Auth ID</span>
              <span class="value id">{{ user?.authId }}</span>
            </div>
            <div class="info-item">
              <span class="label">Role</span>
              <span class="value role" :class="user?.role">{{ user?.role || 'user' }}</span>
            </div>
          </div>
        </section>

        <section class="section">
          <h2>Session Info</h2>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Has Token</span>
              <span class="value">{{ token ? 'Yes' : 'No' }}</span>
            </div>
            <div class="info-item">
              <span class="label">Token Preview</span>
              <span class="value id">{{ tokenPreview }}</span>
            </div>
          </div>
        </section>

        <!-- Test Convex Query -->
        <section class="section">
          <h2>Convex Connection</h2>
          <div class="convex-test">
            <button class="btn btn-secondary" :disabled="isTestingConvex" @click="testConvexQuery">
              {{ isTestingConvex ? 'Testing...' : 'Test Authenticated Query' }}
            </button>
            <div v-if="convexResult" class="result" :class="{ error: convexError }">
              <pre>{{ convexResult }}</pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { api } from '~/convex/_generated/api'

definePageMeta({
  layout: 'sidebar',
})

const { isAuthenticated, isPending, token } = useConvexAuth()
const authClient = useAuthClient()
const convex = useConvex()

const isSigningOut = ref(false)
const isTestingConvex = ref(false)
const convexResult = ref<string | null>(null)
const convexError = ref(false)

// Get user profile with role from our users table
const { data: user, pending: isLoadingUser } = useConvexQuery(api.users.getCurrentUser, {})

const tokenPreview = computed(() => {
  if (!token.value) return 'None'
  return token.value.substring(0, 20) + '...'
})

async function handleSignOut() {
  if (!authClient) return

  isSigningOut.value = true
  try {
    await authClient.signOut()
    useState('convex:token').value = null
    useState('convex:user').value = null
    window.location.href = '/'
  }
  catch (error) {
    console.error('Sign out failed:', error)
  }
  finally {
    isSigningOut.value = false
  }
}

async function testConvexQuery() {
  if (!convex) {
    convexResult.value = 'Convex client not available'
    convexError.value = true
    return
  }

  isTestingConvex.value = true
  convexError.value = false

  try {
    const result = await convex.query(api.users.getCurrentUser, {})
    convexResult.value = JSON.stringify(result, null, 2)
  }
  catch (e) {
    convexResult.value = e instanceof Error ? e.message : 'Query failed'
    convexError.value = true
  }
  finally {
    isTestingConvex.value = false
  }
}
</script>

<style scoped>
.container {
  max-width: 700px;
  margin: 0 auto;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e5e7eb;
}

h1 {
  font-size: 1.5rem;
}

.btn-signout {
  padding: 8px 16px;
  background: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-signout:hover:not(:disabled) {
  background: #e5e7eb;
}

.loading, .not-auth {
  text-align: center;
  padding: 40px;
}

.section {
  margin-bottom: 30px;
}

.section:last-child {
  margin-bottom: 0;
}

h2 {
  font-size: 1.1rem;
  margin-bottom: 16px;
  color: #374151;
}

.info-grid {
  display: grid;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.label {
  color: #6b7280;
  font-size: 0.9rem;
}

.value {
  font-weight: 500;
}

.value.id {
  font-family: monospace;
  font-size: 0.8rem;
  color: #6b7280;
}

.value.role {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.value.role.user {
  background: #e5e7eb;
  color: #374151;
}

.value.role.admin {
  background: #fef3c7;
  color: #92400e;
}

.value.role.moderator {
  background: #dbeafe;
  color: #1e40af;
}

.convex-test {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn {
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn:hover:not(:disabled) {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result {
  padding: 12px;
  background: #f0fdf4;
  border-radius: 8px;
  border: 1px solid #86efac;
}

.result.error {
  background: #fef2f2;
  border-color: #fca5a5;
}

.result pre {
  margin: 0;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
