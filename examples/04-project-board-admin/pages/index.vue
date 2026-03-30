<template>
  <main class="page">
    <section class="panel">
      <p class="eyebrow">Example 04</p>
      <h1>Project Board + Admin</h1>
      <p class="lede">
        This is the month-two app: paginated lists, optimistic board updates, uploads, server
        routes, and role management on top of the same explicit auth pattern used in Example 03.
      </p>

      <ConvexAuthLoading>
        <p class="status">Checking your session…</p>
      </ConvexAuthLoading>

      <ConvexUnauthenticated>
        <div class="auth-grid">
          <form class="card" @submit.prevent="handleSignUp">
            <h2>Create account</h2>
            <label class="field">
              <span>Name</span>
              <input v-model="signUpForm.name" data-testid="signup-name" class="input" required />
            </label>
            <label class="field">
              <span>Email</span>
              <input
                v-model="signUpForm.email"
                data-testid="signup-email"
                class="input"
                type="email"
                required
              />
            </label>
            <label class="field">
              <span>Password</span>
              <input
                v-model="signUpForm.password"
                data-testid="signup-password"
                class="input"
                type="password"
                minlength="8"
                required
              />
            </label>
            <button data-testid="signup-submit" class="button" :disabled="authAction.pending.value">
              {{ authAction.pending.value ? 'Creating…' : 'Sign up' }}
            </button>
          </form>

          <form class="card" @submit.prevent="handleSignIn">
            <h2>Sign in</h2>
            <label class="field">
              <span>Email</span>
              <input v-model="signInForm.email" class="input" type="email" required />
            </label>
            <label class="field">
              <span>Password</span>
              <input v-model="signInForm.password" class="input" type="password" required />
            </label>
            <button class="button muted" :disabled="authAction.pending.value">
              {{ authAction.pending.value ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        </div>
      </ConvexUnauthenticated>

      <ConvexAuthenticated>
        <header class="toolbar">
          <div>
            <h2>{{ displayName }}</h2>
            <p class="hint">
              Role: <strong>{{ role || 'loading…' }}</strong>
              <span v-if="tenantId"> · Workspace ID: {{ tenantId }}</span>
            </p>
          </div>

          <div class="toolbar-actions">
            <NuxtLink v-if="tenantId" class="ghost link" to="/admin">Admin</NuxtLink>
            <button class="ghost" type="button" @click="handleSignOut">Sign out</button>
          </div>
        </header>

        <p v-if="ensureUserRow.pending.value" class="status">Preparing your application user…</p>

        <section v-if="isAuthenticated && !tenantId" class="setup-grid">
          <form class="card" @submit.prevent="handleCreateWorkspace">
            <h3>Create workspace</h3>
            <label class="field">
              <span>Name</span>
              <input
                v-model="createWorkspaceForm.name"
                data-testid="workspace-name"
                class="input"
                required
              />
            </label>
            <label class="field">
              <span>Slug</span>
              <input
                v-model="createWorkspaceForm.slug"
                data-testid="workspace-slug"
                class="input"
                required
              />
            </label>
            <button
              data-testid="workspace-submit"
              class="button"
              :disabled="createWorkspace.pending.value"
            >
              {{ createWorkspace.pending.value ? 'Creating…' : 'Create workspace' }}
            </button>
          </form>

          <form class="card" @submit.prevent="handleJoinWorkspace">
            <h3>Join workspace</h3>
            <label class="field">
              <span>Workspace slug</span>
              <input v-model="joinWorkspaceForm.slug" class="input" required />
            </label>
            <label class="field">
              <span>Role</span>
              <select v-model="joinWorkspaceForm.role" class="input">
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
              </select>
            </label>
            <button class="button muted" :disabled="joinWorkspace.pending.value">
              {{ joinWorkspace.pending.value ? 'Joining…' : 'Join workspace' }}
            </button>
          </form>
        </section>

        <section v-if="workspaceOptions?.length && !tenantId" class="workspace-list">
          <h3>Existing workspaces</h3>
          <ul>
            <li v-for="workspace in workspaceOptions" :key="workspace._id">
              <strong>{{ workspace.name }}</strong>
              <span>({{ workspace.slug }})</span>
            </li>
          </ul>
        </section>

        <section v-if="tenantId" class="projects-shell">
          <div class="section-header">
            <div>
              <h3>Projects</h3>
              <p class="hint">
                This list is paginated because real lists get long. The page still stays live after
                the first load.
              </p>
            </div>
            <NuxtLink v-if="can('workspace.audit')" class="ghost link" to="/admin">
              Open admin dashboard
            </NuxtLink>
          </div>

          <form v-if="canCreateProject" class="composer" @submit.prevent="handleCreateProject">
            <label class="field">
              <span>Project name</span>
              <input
                v-model="projectForm.name"
                data-testid="project-name"
                class="input"
                placeholder="Launch board refresh"
                required
              />
            </label>
            <label class="field">
              <span>Summary</span>
              <input
                v-model="projectForm.summary"
                class="input"
                placeholder="One-line context for the team"
              />
            </label>
            <button
              data-testid="project-submit"
              class="button"
              :disabled="createProject.pending.value"
            >
              {{ createProject.pending.value ? 'Creating…' : 'Create project' }}
            </button>
          </form>

          <div class="project-grid">
            <NuxtLink
              v-for="project in projects"
              :key="project._id"
              :data-testid="`project-link-${project._id}`"
              class="project-card"
              :to="`/projects/${project._id}`"
            >
              <strong>{{ project.name }}</strong>
              <p>{{ project.summary || 'No summary yet.' }}</p>
            </NuxtLink>
          </div>

          <div class="pagination-row">
            <button
              v-if="projectStatus === 'ready'"
              data-testid="projects-load-more"
              class="ghost"
              type="button"
              @click="loadMoreProjects(12)"
            >
              Load more
            </button>
            <p v-if="projectStatus === 'exhausted'" class="hint">All projects loaded.</p>
          </div>
        </section>
      </ConvexAuthenticated>
    </section>
  </main>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * Example 04 keeps onboarding, project creation, and pagination on one page so the jump into the
 * board stays fast. This is where users see the progression from auth -> workspace -> real feature work.
 */
import { computed, reactive, ref } from 'vue'

import { api } from '~/convex/_generated/api'

const { client, signOut, user } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, isAuthenticated, role, tenantId, ctx } = usePermissions()

const signUpForm = reactive({
  name: '',
  email: '',
  password: '',
})

const signInForm = reactive({
  email: '',
  password: '',
})

const createWorkspaceForm = reactive({
  name: '',
  slug: '',
})

const joinWorkspaceForm = reactive({
  slug: '',
  role: 'member' as 'admin' | 'member' | 'viewer',
})

const projectForm = reactive({
  name: '',
  summary: '',
})

const ensureUserRow = useEnsureConvexUser(api.auth.createUserIfNeeded)
const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)
const createProject = useConvexMutation(api.projects.create)

const { data: workspaceOptions } = await useConvexQuery(api.workspaces.listWorkspaces, {})

const projectArgs = computed(() => tenantId.value ? {} : undefined)
const {
  results: projects,
  status: projectStatus,
  loadMore: loadMoreProjects,
} = await useConvexPaginatedQuery(api.projects.list, projectArgs, {
  initialNumItems: 12,
})

const displayName = computed(
  () => ctx.value?.displayName || user.value?.name || user.value?.email || 'Signed in',
)
const canCreateProject = can('project.create')

async function handleSignUp() {
  await authAction.execute(
    () => client.signUp.email({
      email: signUpForm.email,
      password: signUpForm.password,
      name: signUpForm.name,
    }),
    { redirectTo: '/' },
  )
}

async function handleSignIn() {
  await authAction.execute(
    () => client.signIn.email({
      email: signInForm.email,
      password: signInForm.password,
    }),
    { redirectTo: '/' },
  )
}

async function handleSignOut() {
  await signOut()
}

async function handleCreateWorkspace() {
  await createWorkspace({
    name: createWorkspaceForm.name,
    slug: createWorkspaceForm.slug,
  })
}

async function handleJoinWorkspace() {
  await joinWorkspace({
    slug: joinWorkspaceForm.slug,
    role: joinWorkspaceForm.role,
  })
}

async function handleCreateProject() {
  await createProject({
    name: projectForm.name,
    summary: projectForm.summary || undefined,
  })
  projectForm.name = ''
  projectForm.summary = ''
}
</script>

<style scoped>
.page {
  padding: 2rem;
  background: linear-gradient(180deg, #f7fbff 0%, #eef4fb 100%);
  min-height: 100vh;
}

.panel {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  gap: 1.5rem;
}

.eyebrow {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #365fb0;
  font-size: 0.8rem;
}

.lede,
.hint,
.status {
  margin: 0;
  color: #667085;
}

.toolbar,
.section-header,
.toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.auth-grid,
.setup-grid,
.project-grid {
  display: grid;
  gap: 1rem;
}

.auth-grid,
.setup-grid {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.project-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.card,
.project-card,
.composer,
.workspace-list,
.projects-shell {
  border: 1px solid #dbe4ef;
  border-radius: 20px;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
}

.project-card {
  display: grid;
  gap: 0.5rem;
  text-decoration: none;
  color: #132238;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.input {
  width: 100%;
  padding: 0.75rem 0.85rem;
  border: 1px solid #c7d4e5;
  border-radius: 12px;
}

.button,
.ghost {
  padding: 0.75rem 1rem;
  border-radius: 999px;
  border: 1px solid #355fb0;
  cursor: pointer;
}

.button {
  background: #355fb0;
  color: white;
}

.button.muted,
.ghost {
  background: white;
  color: #355fb0;
}

.link {
  text-decoration: none;
}

.pagination-row {
  display: flex;
  justify-content: center;
}
</style>
