<!--
Why this file exists:
This page shows the split between cheap plan context in the UI and real limit checks in handlers.
-->
<template>
  <main class="page">
    <h1>Example 08: Freemium Workspace</h1>
    <p>
      This example separates plan entitlements from usage limits. The current plan is cheap to
      expose in context, but the project limit still needs a real database-backed guard.
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
          <span v-if="role"> · role: {{ role }}</span>
          <span v-if="plan"> · plan: {{ plan }}</span>
        </p>
        <button @click="handleSignOut">Sign out</button>
      </header>

      <p v-if="ensureUserRow.pending.value">Preparing your application user...</p>

      <section v-if="!tenantId">
        <form @submit.prevent="handleCreateWorkspace">
          <h2>Create workspace</h2>
          <input v-model="createWorkspaceForm.name" placeholder="Workspace name" required />
          <input v-model="createWorkspaceForm.slug" placeholder="Slug" required />
          <button :disabled="createWorkspace.pending.value">Create workspace</button>
        </form>

        <form @submit.prevent="handleJoinWorkspace">
          <h2>Join workspace</h2>
          <input v-model="joinWorkspaceForm.slug" placeholder="Workspace slug" required />
          <select v-model="joinWorkspaceForm.role">
            <option value="admin">admin</option>
            <option value="member">member</option>
          </select>
          <button :disabled="joinWorkspace.pending.value">Join workspace</button>
        </form>
      </section>

      <section v-else>
        <p v-if="usageProjects">
          Projects: {{ usageProjects.current }}/{{ usageProjects.max === Infinity ? '∞' : usageProjects.max }}
        </p>
        <p>Exports enabled: {{ can('workspace.exports').value ? 'yes' : 'no' }}</p>

        <button @click="upgradePlan({ plan: 'pro' })">Upgrade to pro</button>

        <form @submit.prevent="handleCreateProject">
          <input v-model="projectForm.name" placeholder="Project name" required />
          <button :disabled="createProject.pending.value || !can('project.create').value">
            Create project
          </button>
        </form>

        <button v-if="can('workspace.exports').value" @click="runExport">Run export</button>

        <ul v-if="projects?.length">
          <li v-for="project in projects" :key="project._id">
            {{ project.name }} · {{ project.status }}
          </li>
        </ul>

        <pre v-if="exportResult">{{ exportResult }}</pre>
        <p v-if="projectError">{{ projectError }}</p>
      </section>
    </ConvexAuthenticated>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { api } from '~/convex/_generated/api'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, ctx, plan, role, tenantId } = usePermissions()

const signUpForm = reactive({ name: '', email: '', password: '' })
const signInForm = reactive({ email: '', password: '' })
const createWorkspaceForm = reactive({ name: '', slug: '' })
const joinWorkspaceForm = reactive({
  slug: '',
  role: 'member' as 'admin' | 'member',
})
const projectForm = reactive({ name: '' })
const exportResult = ref('')

const ensureUserRow = useEnsureConvexUser(api.auth.createUserIfNeeded)
const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)
const upgradePlan = useConvexMutation(api.workspaces.upgradePlan)
const createProject = useConvexMutation(api.projects.create)

const projectArgs = computed(() => (tenantId.value ? {} : undefined))
const { data: projects, error: projectsError } = await useConvexQuery(api.projects.list, projectArgs)
const exportArgs = computed(() => (tenantId.value && can('workspace.exports').value ? {} : undefined))
const { data: exportData } = await useConvexQuery(api.projects.exportProjects, exportArgs)

const usageProjects = computed(() => ctx.value?.usage?.projects ?? null)
const projectError = computed(
  () =>
    projectsError.value?.message
    || createProject.error.value?.message
    || upgradePlan.error.value?.message
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
  await createProject({ name: projectForm.name })
}

async function runExport() {
  exportResult.value = exportData.value ?? ''
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
ul,
pre {
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
