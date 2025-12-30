<template>
  <div class="container">
    <header class="header">
      <h1>Convexi Playground</h1>
      <p class="subtitle">Nuxt + Convex + Better Auth</p>

      <!-- Auth Status -->
      <div class="auth-status">
        <template v-if="isAuthenticated">
          <span class="status authenticated">
            Logged in as <strong>{{ user?.name || user?.email }}</strong>
          </span>
          <button class="btn btn-sm" :disabled="isSigningOut" @click="handleSignOut">
            {{ isSigningOut ? 'Signing out...' : 'Sign Out' }}
          </button>
        </template>
        <template v-else>
          <span class="status">Not authenticated</span>
          <NuxtLink to="/auth/signin" class="btn btn-sm btn-primary"> Sign In </NuxtLink>
          <NuxtLink to="/auth/signup" class="btn btn-sm"> Sign Up </NuxtLink>
        </template>
      </div>
    </header>

    <div class="grid">
      <!-- Main Pages -->
      <section class="section">
        <h2>Main Pages</h2>
        <div class="links">
          <NuxtLink to="/dashboard" class="link-card">
            <span class="icon">📊</span>
            <div>
              <strong>Dashboard</strong>
              <p>User dashboard (auth required)</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/tasks" class="link-card">
            <span class="icon">✅</span>
            <div>
              <strong>Tasks</strong>
              <p>Task management (auth required)</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/permissions" class="link-card featured">
            <span class="icon">🔐</span>
            <div>
              <strong>Permissions Demo</strong>
              <p>Role-based access control system</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/playground" class="link-card">
            <span class="icon">🎮</span>
            <div>
              <strong>Query Playground</strong>
              <p>Interactive useConvexQuery testing</p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <!-- New Features -->
      <section class="section">
        <h2>New Features</h2>
        <div class="links">
          <NuxtLink to="/test-connection-state" class="link-card new">
            <span class="icon">📡</span>
            <div>
              <strong>Connection State</strong>
              <p>useConvexConnectionState composable</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-auth-components" class="link-card new">
            <span class="icon">🔒</span>
            <div>
              <strong>Auth Components</strong>
              <p>ConvexAuthenticated, Unauthenticated, AuthLoading</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-server-mutation" class="link-card new">
            <span class="icon">🖥️</span>
            <div>
              <strong>Server-Side Mutations</strong>
              <p>fetchQuery, fetchMutation, fetchAction</p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <!-- Query Tests -->
      <section class="section">
        <h2>Query Tests</h2>
        <div class="links">
          <NuxtLink to="/test-lazy/hub" class="link-card">
            <span class="icon">⏳</span>
            <div>
              <strong>Lazy Loading</strong>
              <p>lazy: true/false behavior</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-args/hub" class="link-card">
            <span class="icon">🔧</span>
            <div>
              <strong>Reactive Args</strong>
              <p>Dynamic query arguments</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-skip/hub" class="link-card">
            <span class="icon">⏭️</span>
            <div>
              <strong>Skip Queries</strong>
              <p>Conditional query execution</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-error/hub" class="link-card">
            <span class="icon">❌</span>
            <div>
              <strong>Error Handling</strong>
              <p>Query error states</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-features/hub" class="link-card">
            <span class="icon">🧪</span>
            <div>
              <strong>Query Features</strong>
              <p>refresh, default, client-only</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-ssr" class="link-card">
            <span class="icon">🌐</span>
            <div>
              <strong>SSR Test</strong>
              <p>Server-side rendering</p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <!-- Realtime & Optimistic -->
      <section class="section">
        <h2>Realtime & Optimistic</h2>
        <div class="links">
          <NuxtLink to="/test-realtime/hub" class="link-card">
            <span class="icon">⚡</span>
            <div>
              <strong>Realtime Updates</strong>
              <p>Live subscription testing</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-optimistic/hub" class="link-card">
            <span class="icon">🚀</span>
            <div>
              <strong>Optimistic Updates</strong>
              <p>Instant UI updates</p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <!-- Pagination -->
      <section class="section">
        <h2>Pagination</h2>
        <div class="links">
          <NuxtLink to="/test-paginated-query" class="link-card">
            <span class="icon">📄</span>
            <div>
              <strong>Paginated Query</strong>
              <p>useConvexPaginatedQuery</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-paginated-auth" class="link-card">
            <span class="icon">🔑</span>
            <div>
              <strong>Paginated + Auth</strong>
              <p>Authenticated pagination</p>
            </div>
          </NuxtLink>
          <NuxtLink to="/test-paginated-optimistic" class="link-card">
            <span class="icon">✨</span>
            <div>
              <strong>Paginated Optimistic</strong>
              <p>Optimistic updates with pagination</p>
            </div>
          </NuxtLink>
        </div>
      </section>
    </div>

    <!-- Debug info -->
    <details class="debug">
      <summary>Debug Info</summary>
      <pre>{{ debugInfo }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
const { user, isAuthenticated, token } = useConvexAuth()
const authClient = useAuthClient()

const isSigningOut = ref(false)

const debugInfo = computed(() => ({
  isAuthenticated: isAuthenticated.value,
  hasToken: !!token.value,
  user: user.value,
}))

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
</script>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: system-ui, -apple-system, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 8px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: #666;
  font-size: 1.1rem;
  margin-bottom: 20px;
}

.auth-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.status {
  font-size: 0.9rem;
  color: #666;
}

.status.authenticated {
  color: #059669;
}

.btn {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid #e5e7eb;
  background: white;
  color: #374151;
  transition: all 0.2s;
}

.btn:hover {
  background: #f3f4f6;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.85rem;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 24px;
}

.section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section h2 {
  font-size: 1.1rem;
  margin: 0 0 16px 0;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.link-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.link-card:hover {
  background: #f3f4f6;
  border-color: #e5e7eb;
}

.link-card.featured {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.link-card.featured:hover {
  background: #d1fae5;
}

.link-card.new {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.link-card.new:hover {
  background: #dbeafe;
}

.link-card .icon {
  font-size: 1.5rem;
  line-height: 1;
}

.link-card strong {
  display: block;
  color: #1f2937;
  margin-bottom: 2px;
}

.link-card p {
  margin: 0;
  font-size: 0.85rem;
  color: #6b7280;
}

.debug {
  margin-top: 40px;
  text-align: left;
  font-size: 0.8rem;
  background: white;
  border-radius: 8px;
  padding: 16px;
}

.debug summary {
  cursor: pointer;
  color: #666;
}

.debug pre {
  background: #f3f4f6;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin-top: 8px;
}
</style>
