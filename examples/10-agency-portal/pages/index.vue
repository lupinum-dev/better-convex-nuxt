<!--
Why this file exists:
This page keeps current-workspace actions and cross-client reporting in the same screen without hiding the boundary between them.
-->
<template>
  <main class="page">
    <h1>Example 10: Agency Portal</h1>
    <p>
      Current-workspace actions still respect the normal tenant boundary. The agency dashboard is a
      separate path that looks across assigned clients only.
    </p>

    <ConvexAuthLoading>
      <p>Checking your session...</p>
    </ConvexAuthLoading>

    <ConvexUnauthenticated>
      <form @submit.prevent="handleSignUp">
        <h2>Create account</h2>
        <input v-model="signUpForm.name" placeholder="Name" required />
        <input v-model="signUpForm.email" placeholder="Email" type="email" required />
        <input v-model="signUpForm.password" placeholder="Password" type="password" required />
        <button :disabled="authAction.pending.value">Sign up</button>
      </form>

      <form @submit.prevent="handleSignIn">
        <h2>Sign in</h2>
        <input v-model="signInForm.email" placeholder="Email" type="email" required />
        <input v-model="signInForm.password" placeholder="Password" type="password" required />
        <button :disabled="authAction.pending.value">Sign in</button>
      </form>
    </ConvexUnauthenticated>

    <ConvexAuthenticated>
      <header>
        <p>
          Signed in as <strong>{{ ctx?.displayName || user?.email }}</strong>
          <span v-if="role"> · current role: {{ role }}</span>
        </p>
        <button @click="handleSignOut">Sign out</button>
      </header>

      <p v-if="false">Preparing your application user...</p>

      <section v-if="!tenantId">
        <form @submit.prevent="handleCreateWorkspace">
          <h2>Create client workspace</h2>
          <input v-model="createWorkspaceForm.name" placeholder="Workspace name" required />
          <input v-model="createWorkspaceForm.slug" placeholder="Slug" required />
          <button :disabled="createWorkspace.pending.value">Create workspace</button>
        </form>

        <form @submit.prevent="handleJoinWorkspace">
          <h2>Join client workspace</h2>
          <input v-model="joinWorkspaceForm.slug" placeholder="Workspace slug" required />
          <select v-model="joinWorkspaceForm.role">
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
          <button :disabled="joinWorkspace.pending.value">Join workspace</button>
        </form>
      </section>

      <section v-else>
        <button @click="seedAgencyPortfolio({})">Seed agency portfolio</button>

        <h2>Accessible workspaces</h2>
        <ul v-if="accessibleWorkspaces?.length">
          <li v-for="workspace in accessibleWorkspaces" :key="workspace.workspaceId">
            {{ workspace.name }} · {{ workspace.role }}
            <button @click="switchWorkspace({ workspaceId: workspace.workspaceId })">Switch</button>
          </li>
        </ul>

        <form @submit.prevent="handleCreateProject">
          <input v-model="projectForm.name" placeholder="Project name" required />
          <button :disabled="createProject.pending.value || !canCreateProject">
            Create project in current workspace
          </button>
        </form>

        <ul v-if="projects?.length">
          <li v-for="project in projects" :key="project._id">
            {{ project.name }} · {{ project.status }}
          </li>
        </ul>

        <section v-if="canDashboard">
          <h2>Agency portfolio</h2>
          <ul v-if="portfolio?.length">
            <li v-for="entry in portfolio" :key="entry.workspace.id">
              {{ entry.workspace.name }} · active projects: {{ entry.activeProjects }}
            </li>
          </ul>
        </section>

        <p v-if="projectError">{{ projectError }}</p>
      </section>
    </ConvexAuthenticated>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'

import { api } from '~/convex/_generated/api'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, ctx, role, tenantId } = usePermissions()
const canCreateProject = can('project.create')
const canDashboard = can('agency.dashboard')

const signUpForm = reactive({ name: '', email: '', password: '' })
const signInForm = reactive({ email: '', password: '' })
const createWorkspaceForm = reactive({ name: '', slug: '' })
const joinWorkspaceForm = reactive({
  slug: '',
  role: 'member' as 'member' | 'viewer',
})
const projectForm = reactive({ name: '' })

const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)
const switchWorkspace = useConvexMutation(api.workspaces.switchWorkspace)
const seedAgencyPortfolio = useConvexMutation(api.workspaces.seedAgencyPortfolio)
const createProject = useConvexMutation(api.projects.create)

const workspaceArgs = computed(() => (tenantId.value ? {} : undefined))
const { data: accessibleWorkspaces } = await useConvexQuery(api.workspaces.listAccessibleWorkspaces, workspaceArgs)
const { data: projects, error: projectsError } = await useConvexQuery(api.projects.list, workspaceArgs)
const { data: portfolio } = await useConvexQuery(
  api.dashboard.portfolio,
  computed(() => (canDashboard.value ? {} : undefined)),
)

const projectError = computed(
  () =>
    projectsError.value?.message
    || createProject.error.value?.message
    || switchWorkspace.error.value?.message
    || '',
)

async function handleSignUp() {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signUp.email(signUpForm), { redirectTo: '/' })
}

async function handleSignIn() {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signIn.email(signInForm), { redirectTo: '/' })
}

async function handleSignOut() {
  await signOut()
}

async function handleCreateWorkspace() {
  await createWorkspace(createWorkspaceForm)
}

async function handleJoinWorkspace() {
  await joinWorkspace(joinWorkspaceForm)
}

async function handleCreateProject() {
  await createProject(projectForm)
}
</script>

<style scoped>
.page {
  max-width: 60rem;
  margin: 0 auto;
  padding: 2rem;
}

form,
section,
header,
ul {
  margin-bottom: 1rem;
}

input,
select,
button {
  display: block;
  width: 100%;
  max-width: 32rem;
  margin: 0.25rem 0;
  padding: 0.5rem;
}
</style>
