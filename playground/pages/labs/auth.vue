<template>
  <div class="container">
    <h1>Auth Lab</h1>
    <p class="description">
      This page tests the <code>&lt;ConvexAuthenticated&gt;</code>,
      <code>&lt;ConvexUnauthenticated&gt;</code>, and
      <code>&lt;ConvexAuthLoading&gt;</code> components.
    </p>

    <div class="current-state">
      <h2>Current Auth State</h2>
      <p class="hint">
        This page includes a TypeScript-only check for <code>user.role</code>,
        <code>user.authId</code>, and <code>user.organizationId</code>. If this page compiles and
        loads, the local <code>ConvexUser</code> augmentation is working.
      </p>
      <p class="hint">
        <strong>Important:</strong> the authoritative app role comes from Convex (see
        <code>convex db role</code> below). The <code>custom role</code> field here is a demo JWT
        typing example, not a runtime auth field.
      </p>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">isAuthenticated</span>
          <span class="value" :class="{ positive: isAuthenticated }">
            {{ isAuthenticated }}
          </span>
        </div>
        <div class="state-item">
          <span class="label">isPending</span>
          <span class="value" :class="{ active: isPending }">
            {{ isPending }}
          </span>
        </div>
        <div class="state-item">
          <span class="label">convex jwt</span>
          <span class="value">{{ isAuthenticated ? '(hydrated)' : '(none)' }}</span>
        </div>
        <div class="state-item">
          <span class="label">user</span>
          <span class="value">{{ user?.name || user?.email || '(none)' }}</span>
        </div>
        <div class="state-item">
          <span class="label">custom role</span>
          <span class="value">{{ augmentedUserFields?.role || '(no JWT claim)' }}</span>
        </div>
        <div class="state-item">
          <span class="label">custom authId</span>
          <span class="value id">{{ augmentedUserFields?.authId || '(no JWT claim)' }}</span>
        </div>
        <div class="state-item">
          <span class="label">custom orgId</span>
          <span class="value id">{{
            augmentedUserFields?.organizationId || '(no JWT claim)'
          }}</span>
        </div>
        <div class="state-item">
          <span class="label">convex db role</span>
          <span class="value">{{ permissionRole || '(not loaded)' }}</span>
        </div>
      </div>
    </div>

    <ClientOnly>
      <div class="plugin-lab">
        <h2>Additional Fields Verification</h2>
        <p class="hint">
          This panel verifies typed Better Auth <code>additionalFields</code> via
          <code>inferAdditionalFields&lt;AppAuth&gt;()</code> while keeping Convex token sync.
        </p>

        <div class="state-grid plugin-grid">
          <div class="state-item">
            <span class="label">extended client</span>
            <span class="value" :class="{ positive: pluginChecks.hasExtendedClient }">
              {{ pluginChecks.hasExtendedClient ? 'ready' : 'initializing...' }}
            </span>
          </div>
          <div class="state-item">
            <span class="label">session additional orgId</span>
            <span class="value id">{{ pluginSessionFields.organizationId }}</span>
          </div>
          <div class="state-item">
            <span class="label">session additional marketingOptIn</span>
            <span class="value">{{ pluginSessionFields.marketingOptIn }}</span>
          </div>
          <div class="state-item">
            <span class="label">session user email</span>
            <span class="value">{{ pluginSessionFields.email }}</span>
          </div>
          <div class="state-item">
            <span class="label">plugin init</span>
            <span class="value" :class="{ positive: !pluginInitError }">
              {{ pluginInitError || 'ok' }}
            </span>
          </div>
        </div>
      </div>
      <template #fallback>
        <div class="plugin-lab">
          <h2>Additional Fields Verification</h2>
          <p class="hint">Client-only panel: waiting for hydration...</p>
        </div>
      </template>
    </ClientOnly>

    <div v-if="isAuthenticated" class="demo-card">
      <h3>Convex Role Management Demo (Authoritative)</h3>
      <p class="demo-description">
        This updates the role in the Convex <code>users</code> table (the real app source of truth).
        The JWT claim shown above is intentionally a demo/static claim.
      </p>
      <div class="demo-output">
        <div class="button-group role-buttons">
          <button
            v-for="roleOption in roleOptions"
            :key="roleOption"
            class="btn btn-secondary"
            :disabled="isUpdatingRole"
            @click="changeRole(roleOption)"
          >
            Set {{ roleOption }}
          </button>
        </div>
        <p v-if="claimDemoStatus" class="status-text">{{ claimDemoStatus }}</p>
      </div>
    </div>

    <div class="component-demos">
      <h2>Component Demos</h2>

      <div class="demo-card">
        <h3>&lt;ConvexAuthLoading&gt;</h3>
        <p class="demo-description">Shows content only while auth is loading</p>
        <div class="demo-output">
          <ConvexAuthLoading>
            <div class="loading-indicator">
              <span class="spinner" />
              Checking authentication...
            </div>
          </ConvexAuthLoading>
          <span v-if="!isPending" class="not-shown"
            >(Auth check complete - loading content hidden)</span
          >
        </div>
      </div>

      <div class="demo-card">
        <h3>&lt;ConvexAuthenticated&gt;</h3>
        <p class="demo-description">Shows content only when user is authenticated</p>
        <div class="demo-output">
          <ConvexAuthenticated>
            <div class="auth-content authenticated">
              <span class="icon">&#x2714;</span>
              <div>
                <strong>Welcome, {{ user?.name || user?.email || 'User' }}!</strong>
                <p>You are authenticated and can access protected content.</p>
              </div>
            </div>
          </ConvexAuthenticated>
          <span v-if="!isAuthenticated && !isPending" class="not-shown"
            >(Not authenticated - content hidden)</span
          >
        </div>
      </div>

      <div class="demo-card">
        <h3>&lt;ConvexUnauthenticated&gt;</h3>
        <p class="demo-description">Shows content only when user is NOT authenticated</p>
        <div class="demo-output">
          <ConvexUnauthenticated>
            <div class="auth-content unauthenticated">
              <span class="icon">&#x1F512;</span>
              <div>
                <strong>Please log in</strong>
                <p>You need to authenticate to access this feature.</p>
                <NuxtLink to="/auth/signin" class="login-link"> Go to Login &rarr; </NuxtLink>
              </div>
            </div>
          </ConvexUnauthenticated>
          <span v-if="isAuthenticated && !isPending" class="not-shown"
            >(Authenticated - unauthenticated content hidden)</span
          >
        </div>
      </div>
    </div>

    <div class="combined-example">
      <h2>Combined Example (Real-World Pattern)</h2>
      <div class="demo-output">
        <ConvexAuthLoading>
          <div class="loading-indicator">
            <span class="spinner" />
            Loading...
          </div>
        </ConvexAuthLoading>
        <ConvexAuthenticated>
          <div class="dashboard-preview">
            <h4>Dashboard</h4>
            <p>Your personalized content here.</p>
          </div>
        </ConvexAuthenticated>
        <ConvexUnauthenticated>
          <div class="login-prompt">
            <h4>Welcome to the App</h4>
            <p>Please sign in to continue.</p>
          </div>
        </ConvexUnauthenticated>
      </div>
    </div>

    <div class="auth-actions">
      <h2>Test Authentication</h2>
      <div class="button-group">
        <NuxtLink v-if="!isAuthenticated" to="/auth/signin" class="btn btn-primary">
          Log In
        </NuxtLink>
        <button v-else class="btn btn-secondary" @click="signOut">Sign Out</button>
      </div>
      <p v-if="signOutError" class="status-text">{{ signOutError }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { api } from '~/convex/_generated/api'

definePageMeta({
  layout: 'sidebar',
})

const { isAuthenticated, isPending, user, signOut: authSignOut } = useConvexAuth()
const nuxtApp = useNuxtApp()
const roleOptions = ['admin', 'member', 'viewer'] as const
const isUpdatingRole = ref(false)
const claimDemoStatus = ref('')
const pluginInitError = ref('')
const signOutError = ref('')

type ExtendedAuthClient = NonNullable<ReturnType<typeof useExtendedAuthClient>>
type ExtendedSessionData = ExtendedAuthClient['$Infer']['Session']

const extendedAuthClient = shallowRef<ExtendedAuthClient | null>(null)
const extendedSessionStore = shallowRef<unknown>(null)

const permissionQueryArgs = computed(() => (isAuthenticated.value ? {} : undefined))
const { data: permissionContext } = await useConvexQuery(
  api.auth.getPermissionContext,
  permissionQueryArgs,
)

// Compile-time proof: these property accesses fail if ConvexUser augmentation
// does not flow through useConvexAuth().user.
const augmentedUserFields = computed(() => ({
  role: user.value?.role,
  authId: user.value?.authId,
  organizationId: user.value?.organizationId,
}))
const permissionRole = computed(() =>
  permissionContext.value && 'role' in permissionContext.value
    ? permissionContext.value.role
    : null,
)

onMounted(() => {
  try {
    const client = useExtendedAuthClient()
    extendedAuthClient.value = client
    const sessionState = client?.useSession()
    if (sessionState && typeof sessionState === 'object' && 'value' in sessionState) {
      extendedSessionStore.value = sessionState
    } else {
      extendedSessionStore.value = null
      if (sessionState) {
        pluginInitError.value = 'init warning: unexpected useSession() return shape'
      }
    }
    if (!pluginInitError.value) {
      pluginInitError.value = ''
    }
    const sessionStore = extendedSessionStore.value as {
      value?: { data?: ExtendedSessionData | null }
    } | null
    void sessionStore?.value?.data?.user?.organizationId
    void sessionStore?.value?.data?.user?.marketingOptIn
  } catch (error) {
    pluginInitError.value = `init failed: ${formatErrorMessage(error)}`
    extendedAuthClient.value = null
    extendedSessionStore.value = null
  }
})

const pluginChecks = computed(() => ({
  hasExtendedClient: !!extendedAuthClient.value,
}))

const pluginSessionFields = computed(() => {
  const sessionStore = extendedSessionStore.value as {
    value?: { data?: ExtendedSessionData | null }
  } | null
  const sessionUser = sessionStore?.value?.data?.user
  return {
    organizationId: sessionUser?.organizationId ?? '(undefined / not set yet)',
    marketingOptIn:
      typeof sessionUser?.marketingOptIn === 'boolean'
        ? String(sessionUser.marketingOptIn)
        : '(undefined / not set yet)',
    email: sessionUser?.email ?? '(no Better Auth session user yet)',
  }
})

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error)
  }
}

function getConvexClient() {
  const client = nuxtApp.$convex
  if (!client) {
    throw new Error('Convex client unavailable')
  }
  return client
}

async function changeRole(role: (typeof roleOptions)[number]) {
  isUpdatingRole.value = true
  claimDemoStatus.value = ''
  try {
    const convex = getConvexClient()
    await convex.mutation(api.auth.setOwnRole, { role })
    claimDemoStatus.value = `Convex DB role updated to ${role}. (Authoritative role is shown in "convex db role" above.)`
  } catch (e) {
    claimDemoStatus.value = `Failed to update role: ${e instanceof Error ? e.message : 'Unknown error'}`
  } finally {
    isUpdatingRole.value = false
  }
}

async function signOut() {
  signOutError.value = ''
  try {
    await authSignOut()
  } catch (error) {
    signOutError.value = `Sign out failed: ${formatErrorMessage(error)}`
  }
}
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
}

h1 {
  margin-bottom: 8px;
}

h2 {
  margin-top: 32px;
  margin-bottom: 16px;
  font-size: 1.3em;
  border-bottom: 2px solid #eee;
  padding-bottom: 8px;
}

.description {
  color: #666;
  margin-bottom: 24px;
}

.hint {
  margin: 0 0 12px 0;
  color: #555;
  font-size: 0.9em;
}

code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.current-state {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 8px;
}

.current-state h2 {
  margin-top: 0;
  border: none;
}

.state-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.state-item {
  background: white;
  padding: 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-item .label {
  font-size: 0.85em;
  color: #666;
}

.state-item .value {
  font-weight: 600;
  font-family: monospace;
  overflow-wrap: anywhere;
}

.state-item .value.positive {
  color: #4caf50;
}
.state-item .value.active {
  color: #ff9800;
}
.state-item .value.id {
  font-size: 0.9em;
}

.status-text {
  margin: 12px 0 0;
  color: #444;
}

.role-buttons {
  flex-wrap: wrap;
}

.plugin-lab {
  margin-top: 24px;
}

.plugin-grid {
  margin-bottom: 16px;
}

.demo-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.demo-card h3 {
  margin: 0 0 4px 0;
  font-family: monospace;
  font-size: 1em;
  color: #1976d2;
}

.demo-description {
  margin: 0 0 12px 0;
  font-size: 0.9em;
  color: #666;
}

.demo-output {
  background: #fafafa;
  border: 1px dashed #ccc;
  border-radius: 6px;
  padding: 16px;
  min-height: 60px;
}

.not-shown {
  color: #999;
  font-style: italic;
  font-size: 0.9em;
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #666;
}

.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid #e0e0e0;
  border-top-color: #2196f3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.auth-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
}

.auth-content.authenticated {
  background: #e8f5e9;
  border: 1px solid #c8e6c9;
}

.auth-content.unauthenticated {
  background: #fff3e0;
  border: 1px solid #ffe0b2;
}

.auth-content .icon {
  font-size: 1.5em;
}

.auth-content p {
  margin: 4px 0 8px 0;
  font-size: 0.9em;
  color: #666;
}

.login-link {
  color: #1976d2;
  text-decoration: none;
  font-size: 0.9em;
}

.login-link:hover {
  text-decoration: underline;
}

.combined-example .demo-output {
  background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
}

.dashboard-preview,
.login-prompt {
  text-align: center;
  padding: 20px;
}

.dashboard-preview {
  background: #e3f2fd;
  border-radius: 8px;
}

.login-prompt {
  background: #fff8e1;
  border-radius: 8px;
}

.dashboard-preview h4,
.login-prompt h4 {
  margin: 0 0 8px 0;
}

.dashboard-preview p,
.login-prompt p {
  margin: 0;
  color: #666;
}

.auth-actions {
  background: #f0f7ff;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}

.auth-actions h2 {
  margin-top: 0;
  border: none;
}

.button-group {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  display: inline-block;
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 1em;
  text-decoration: none;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: #2196f3;
  color: white;
}

.btn-primary:hover {
  background: #1976d2;
}

.btn-secondary {
  background: #757575;
  color: white;
}

.btn-secondary:hover {
  background: #616161;
}
</style>
