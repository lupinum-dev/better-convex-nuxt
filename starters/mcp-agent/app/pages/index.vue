<script setup lang="ts">
import { api } from '#convex/api'
import type { Doc, Id } from '~~/convex/_generated/dataModel'

defineOptions({ name: 'McpAgentStarterPage' })

type AuthMode = 'signUp' | 'signIn'
type ServiceActorRole = 'viewer' | 'member' | 'admin'
type Project = Doc<'projects'>

const {
  user,
  isAuthenticated,
  isPending,
  signIn,
  signUp,
  signOut,
  refreshAuth,
  authError
} = useConvexAuth()

const mode = ref<AuthMode>('signUp')
const name = ref('Agent Owner')
const email = ref(`mcp-owner-${Date.now()}@example.com`)
const password = ref('password123')
const authMessage = ref<string | null>(null)
const authFormError = ref<string | null>(null)
const authBusy = ref(false)

const appUserReady = ref(false)
const bootstrapError = ref<string | null>(null)
const bootstrapBusy = ref(false)

const selectedOrganizationId = ref<Id<'organizations'> | ''>('')
const organizationName = ref('Acme Agent Workspace')
const projectName = ref('Human launch plan')
const serviceActorName = ref('Project assistant')
const serviceActorRole = ref<ServiceActorRole>('member')
const serviceActorSecret = ref('')
const mcpProjectName = ref('MCP generated project')
const actionError = ref<string | null>(null)
const actionStatus = ref<string | null>(null)
const pendingAction = ref<string | null>(null)

const organizationsArgs = computed(() => (appUserReady.value ? {} : 'skip'))
const selectedOrganizationArgs = computed(() =>
  appUserReady.value && selectedOrganizationId.value
    ? { organizationId: selectedOrganizationId.value }
    : 'skip'
)

const { data: organizations, refresh: refreshOrganizations } = await useConvexQuery(
  api.organizations.listMine,
  organizationsArgs
)
const { data: projects, refresh: refreshProjects } = await useConvexQuery(
  api.projects.listForCurrentUser,
  selectedOrganizationArgs
)
const { data: serviceActors, refresh: refreshServiceActors } = await useConvexQuery(
  api.serviceActors.listForOrganization,
  selectedOrganizationArgs
)

const upsertCurrent = useConvexMutation(api.users.upsertCurrent)
const createOrganization = useConvexMutation(api.organizations.create)
const createProject = useConvexMutation(api.projects.createForCurrentUser)
const createServiceActor = useConvexMutation(api.serviceActors.create)

const selectedOrganization = computed(() =>
  organizations.value?.find((organization) => organization.id === selectedOrganizationId.value)
)
const canSubmitAuth = computed(() => {
  if (!email.value.trim() || password.value.length < 8) return false
  return mode.value === 'signIn' || !!name.value.trim()
})
const authSubmitLabel = computed(() => {
  if (authBusy.value) return mode.value === 'signIn' ? 'Signing in...' : 'Creating account...'
  return mode.value === 'signIn' ? 'Sign in' : 'Create account'
})
const passwordAutocomplete = computed(() =>
  mode.value === 'signIn' ? 'current-password' : 'new-password'
)

watch(mode, () => {
  authFormError.value = null
  authMessage.value = null
})

watch(organizations, (items) => {
  if (!items?.length) {
    selectedOrganizationId.value = ''
    return
  }
  if (!selectedOrganizationId.value || !items.some((item) => item.id === selectedOrganizationId.value)) {
    const [firstOrganization] = items
    if (firstOrganization) {
      selectedOrganizationId.value = firstOrganization.id
    }
  }
}, { immediate: true })

watch(selectedOrganizationId, async (organizationId) => {
  if (!organizationId || !appUserReady.value) return

  await nextTick()
  await Promise.all([refreshProjects(), refreshServiceActors()])
})

watch(isAuthenticated, async (authenticated) => {
  if (!authenticated) {
    appUserReady.value = false
    selectedOrganizationId.value = ''
    return
  }

  await bootstrapCurrentUser()
}, { immediate: true })

function setActionResult(status: string) {
  actionStatus.value = status
  actionError.value = null
}

function setActionError(error: unknown) {
  actionStatus.value = null
  actionError.value = error instanceof Error ? error.message : 'Action failed'
}

async function bootstrapCurrentUser() {
  if (!isAuthenticated.value || bootstrapBusy.value) return

  bootstrapBusy.value = true
  bootstrapError.value = null
  try {
    await upsertCurrent({})
    appUserReady.value = true
    await nextTick()
    await refreshOrganizations()
  } catch (error) {
    appUserReady.value = false
    bootstrapError.value = error instanceof Error ? error.message : 'User bootstrap failed'
  } finally {
    bootstrapBusy.value = false
  }
}

async function submitAuth() {
  if (!canSubmitAuth.value) return

  authBusy.value = true
  authFormError.value = null
  authMessage.value = null
  try {
    if (mode.value === 'signUp') {
      const result = await signUp.email({
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value
      })
      if (result.error) throw new Error(result.error.message || 'Sign up failed')
    } else {
      const result = await signIn.email({
        email: email.value.trim(),
        password: password.value
      })
      if (result.error) throw new Error(result.error.message || 'Sign in failed')
    }

    password.value = ''
    await refreshAuth()
    await bootstrapCurrentUser()
    authMessage.value = 'Signed in and app user bootstrapped'
  } catch (error) {
    authFormError.value = error instanceof Error ? error.message : 'Authentication failed'
  } finally {
    authBusy.value = false
  }
}

async function handleSignOut() {
  await signOut()
  appUserReady.value = false
  actionStatus.value = null
  actionError.value = null
  authMessage.value = null
  authFormError.value = null
  serviceActorSecret.value = ''
}

async function runAction(id: string, action: () => Promise<void>) {
  pendingAction.value = id
  actionError.value = null
  actionStatus.value = null
  try {
    await action()
  } catch (error) {
    setActionError(error)
  } finally {
    pendingAction.value = null
  }
}

async function createWorkspace() {
  await runAction('create-org', async () => {
    const organizationId = await createOrganization({ name: organizationName.value })
    selectedOrganizationId.value = organizationId
    await refreshOrganizations()
    setActionResult('Organization created')
  })
}

async function createHumanProject() {
  const organizationId = selectedOrganizationId.value
  if (!organizationId) return

  await runAction('create-project', async () => {
    await createProject({
      organizationId,
      name: projectName.value
    })
    projectName.value = 'Human launch plan'
    await refreshProjects()
    setActionResult('Human project created through Convex')
  })
}

function generateBearerSecret() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  serviceActorSecret.value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function createAgentCredential() {
  const organizationId = selectedOrganizationId.value
  if (!organizationId) return

  await runAction('create-agent', async () => {
    if (!serviceActorSecret.value) {
      generateBearerSecret()
    }

    await createServiceActor({
      organizationId,
      name: serviceActorName.value,
      role: serviceActorRole.value,
      credentialHash: await sha256Hex(serviceActorSecret.value)
    })
    await refreshServiceActors()
    setActionResult('Service actor credential created. The bearer secret is shown once in this browser.')
  })
}

async function createProjectThroughMcp() {
  const organizationId = selectedOrganizationId.value
  if (!organizationId || !serviceActorSecret.value) return

  await runAction('mcp-create-project', async () => {
    const response = await $fetch('/api/demo/mcp-projects', {
      method: 'POST',
      body: {
        bearerToken: serviceActorSecret.value,
        organizationId,
        name: mcpProjectName.value
      }
    }) as { content: string[] }

    await refreshProjects()
    setActionResult(response.content[0] ?? 'MCP project created')
  })
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(value)
}

function creatorLabel(project: Project) {
  if (project.createdBy.kind === 'user') return 'human'
  return 'service actor'
}
</script>

<template>
  <main class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Better Convex Nuxt</p>
        <h1>MCP agent starter</h1>
      </div>
      <div class="header-status" data-testid="auth-status">
        <span :class="['status-dot', isAuthenticated ? 'online' : 'idle']" />
        {{ isAuthenticated ? user?.email || 'Signed in' : 'Signed out' }}
      </div>
    </header>

    <section v-if="!isAuthenticated" class="section-grid auth-layout">
      <div class="intro-copy">
        <p class="eyebrow">Complete flow</p>
        <h2>Sign in, create an org, mint a service actor, then call MCP.</h2>
        <p>
          Humans and service actors use the same project domain operations behind separate
          authorization wrappers. MCP stays transport-only.
        </p>
      </div>

      <form class="panel auth-panel" data-testid="auth-form" @submit.prevent="submitAuth">
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
            minlength="8"
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

        <button class="primary-button" data-testid="auth-submit" :disabled="authBusy || !canSubmitAuth">
          {{ authSubmitLabel }}
        </button>
      </form>
    </section>

    <section v-else class="workspace">
      <div class="toolbar">
        <div>
          <p class="eyebrow">Signed-in workspace</p>
          <h2>{{ selectedOrganization?.name || 'No organization yet' }}</h2>
        </div>
        <button class="secondary-button" data-testid="sign-out" type="button" @click="handleSignOut">
          Sign out
        </button>
      </div>

      <p v-if="bootstrapBusy || isPending" class="muted-text" data-testid="bootstrap-status">
        Preparing user session...
      </p>
      <p v-if="bootstrapError" class="error-text" data-testid="bootstrap-error">
        {{ bootstrapError }}
      </p>

      <div class="section-grid">
        <section class="panel">
          <div class="panel-heading">
            <span class="step">1</span>
            <div>
              <h3>Organization</h3>
              <p>Create an app-owned organization and owner membership.</p>
            </div>
          </div>

          <label>
            Organization name
            <input v-model="organizationName" data-testid="org-name" />
          </label>
          <button
            class="primary-button"
            data-testid="create-org"
            :disabled="pendingAction === 'create-org' || !appUserReady"
            type="button"
            @click="createWorkspace"
          >
            Create organization
          </button>

          <label v-if="organizations?.length" class="select-label">
            Active organization
            <select v-model="selectedOrganizationId" data-testid="org-select">
              <option
                v-for="organization in organizations"
                :key="organization.id"
                :value="organization.id"
              >
                {{ organization.name }} · {{ organization.role }}
              </option>
            </select>
          </label>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <span class="step">2</span>
            <div>
              <h3>Human project</h3>
              <p>Call the human wrapper with membership enforcement.</p>
            </div>
          </div>

          <label>
            Project name
            <input v-model="projectName" data-testid="human-project-name" />
          </label>
          <button
            class="primary-button"
            data-testid="create-human-project"
            :disabled="pendingAction === 'create-project' || !selectedOrganizationId"
            type="button"
            @click="createHumanProject"
          >
            Create as user
          </button>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <span class="step">3</span>
            <div>
              <h3>Service actor</h3>
              <p>Store only the credential hash and assign an org-scoped role.</p>
            </div>
          </div>

          <label>
            Actor name
            <input v-model="serviceActorName" data-testid="service-actor-name" />
          </label>
          <label>
            Role
            <select v-model="serviceActorRole" data-testid="service-actor-role">
              <option value="viewer">viewer</option>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <div class="secret-row">
            <input
              v-model="serviceActorSecret"
              aria-label="Bearer secret"
              data-testid="service-actor-secret"
              readonly
              placeholder="Generate or create to mint a bearer secret"
            />
            <button class="secondary-button" type="button" @click="generateBearerSecret">
              Generate
            </button>
          </div>
          <button
            class="primary-button"
            data-testid="create-service-actor"
            :disabled="pendingAction === 'create-agent' || !selectedOrganizationId"
            type="button"
            @click="createAgentCredential"
          >
            Create service actor
          </button>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <span class="step">4</span>
            <div>
              <h3>MCP call</h3>
              <p>Call <code>projects.create</code> through this app's real MCP route.</p>
            </div>
          </div>

          <label>
            MCP project name
            <input v-model="mcpProjectName" data-testid="mcp-project-name" />
          </label>
          <button
            class="primary-button"
            data-testid="create-mcp-project"
            :disabled="pendingAction === 'mcp-create-project' || !selectedOrganizationId || !serviceActorSecret"
            type="button"
            @click="createProjectThroughMcp"
          >
            Create through MCP
          </button>
        </section>
      </div>

      <p v-if="actionError" class="error-text feedback" data-testid="action-error">
        {{ actionError }}
      </p>
      <p v-if="actionStatus" class="success-text feedback" data-testid="action-status">
        {{ actionStatus }}
      </p>

      <section class="results-layout">
        <div class="panel results-panel">
          <div class="panel-heading">
            <span class="step">A</span>
            <div>
              <h3>Projects</h3>
              <p>Human reads require active organization membership.</p>
            </div>
          </div>

          <ul v-if="projects?.length" class="item-list" data-testid="project-list">
            <li v-for="project in projects" :key="project._id">
              <strong>{{ project.name }}</strong>
              <span>{{ creatorLabel(project) }} · {{ formatTime(project.createdAt) }}</span>
            </li>
          </ul>
          <p v-else class="empty-state" data-testid="empty-projects">
            No projects yet.
          </p>
        </div>

        <div class="panel results-panel">
          <div class="panel-heading">
            <span class="step">B</span>
            <div>
              <h3>Service actors</h3>
              <p>Credentials are never returned from Convex.</p>
            </div>
          </div>

          <ul v-if="serviceActors?.length" class="item-list" data-testid="service-actor-list">
            <li v-for="actor in serviceActors" :key="actor.id">
              <strong>{{ actor.name }}</strong>
              <span>{{ actor.role }} · {{ actor.status }}</span>
            </li>
          </ul>
          <p v-else class="empty-state" data-testid="empty-service-actors">
            No service actors yet.
          </p>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.page-shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0 56px;
}

.page-header,
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.page-header h1,
.toolbar h2,
.intro-copy h2 {
  margin: 0;
  color: #151515;
  letter-spacing: 0;
  text-wrap: balance;
}

.page-header h1 {
  font-size: clamp(32px, 5vw, 54px);
  line-height: 0.96;
}

.toolbar h2,
.intro-copy h2 {
  font-size: 28px;
  line-height: 1.08;
}

.eyebrow {
  margin: 0 0 8px;
  color: #72531f;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header-status {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  gap: 8px;
  padding: 0 12px;
  border-radius: 999px;
  background: #fff;
  color: #3f3f46;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 12px 30px rgba(0, 0, 0, 0.06);
  font-size: 14px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #a1a1aa;
}

.status-dot.online {
  background: #12805c;
}

.section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.auth-layout {
  align-items: start;
}

.intro-copy {
  padding: 20px 0;
}

.intro-copy p:last-child,
.panel p,
.muted-text {
  color: #52525b;
  line-height: 1.55;
  text-wrap: pretty;
}

.panel {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 18px;
  border-radius: 8px;
  background: #fff;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 18px 45px rgba(0, 0, 0, 0.07);
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.panel-heading h3,
.panel-heading p {
  margin: 0;
}

.panel-heading h3 {
  color: #18181b;
  font-size: 17px;
}

.step {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: #18181b;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: #eceff3;
}

.segmented button {
  min-height: 40px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #52525b;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  transition-property: background-color, color, transform;
  transition-duration: 150ms;
}

.segmented button.active {
  background: #fff;
  color: #18181b;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

label {
  display: grid;
  gap: 6px;
  color: #3f3f46;
  font-size: 13px;
  font-weight: 700;
}

input,
select {
  width: 100%;
  min-height: 42px;
  box-sizing: border-box;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  background: #fff;
  color: #18181b;
  font: inherit;
  padding: 0 11px;
}

input:focus,
select:focus {
  border-color: #2563eb;
  outline: 3px solid rgba(37, 99, 235, 0.18);
}

.primary-button,
.secondary-button {
  min-height: 42px;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  transition-property: opacity, transform, background-color;
  transition-duration: 150ms;
}

.primary-button {
  background: #18181b;
  color: #fff;
  padding: 0 16px;
}

.secondary-button {
  background: #e8edf2;
  color: #18181b;
  padding: 0 14px;
}

.primary-button:active,
.secondary-button:active,
.segmented button:active {
  transform: scale(0.96);
}

.primary-button:disabled,
.secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.workspace {
  display: grid;
  gap: 16px;
}

.secret-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.feedback {
  margin: 0;
}

.error-text,
.success-text,
.empty-state {
  margin: 0;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 14px;
}

.error-text {
  background: #fff0ef;
  color: #b42318;
}

.success-text {
  background: #ecfdf3;
  color: #087443;
}

.results-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 16px;
}

.results-panel {
  min-height: 220px;
}

.item-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #f6f7f9;
}

.item-list strong,
.item-list span {
  min-width: 0;
}

.item-list strong {
  overflow-wrap: anywhere;
}

.item-list span {
  flex: 0 0 auto;
  color: #71717a;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.empty-state {
  background: #f6f7f9;
  color: #71717a;
}

code {
  border-radius: 5px;
  background: #f1f5f9;
  color: #1f2937;
  padding: 2px 5px;
  font-size: 0.92em;
}

@media (max-width: 820px) {
  .page-header,
  .toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .section-grid,
  .results-layout {
    grid-template-columns: 1fr;
  }
}
</style>
