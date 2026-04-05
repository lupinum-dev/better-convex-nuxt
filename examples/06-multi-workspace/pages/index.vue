<!--
Why this file exists:
This page keeps current-workspace actions and cross-client reporting in the same screen without hiding the boundary between them.
-->
<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-5xl">
      <template #header>
        <p class="text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-400">
          Example 06
        </p>
        <h1 class="text-3xl font-bold mt-1">Multi-Workspace Agency Portal</h1>
        <p class="text-sm text-muted mt-2">
          Current-workspace actions respect the normal tenant boundary. The agency dashboard is a
          separate path that looks across assigned clients only.
        </p>
      </template>

      <div class="space-y-4">
        <ConvexAuthLoading>
          <div class="space-y-3">
            <p class="text-sm text-muted">Checking your session...</p>
            <USkeleton class="h-24 w-full rounded-xl" />
          </div>
        </ConvexAuthLoading>

        <ConvexUnauthenticated>
          <div class="grid gap-4 md:grid-cols-2">
            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">Create account</h2>
              </template>

              <form class="space-y-4" @submit.prevent="handleSignUp">
                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Name</label>
                  <UInput v-model="signUpForm.name" data-testid="signup-name" required />
                </div>
                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Email</label>
                  <UInput
                    v-model="signUpForm.email"
                    data-testid="signup-email"
                    type="email"
                    required
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Password</label>
                  <UInput
                    v-model="signUpForm.password"
                    data-testid="signup-password"
                    type="password"
                    minlength="8"
                    required
                  />
                </div>
                <UButton
                  data-testid="signup-submit"
                  type="submit"
                  block
                  :loading="authAction.pending.value"
                >
                  Sign up
                </UButton>
              </form>
            </UCard>

            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">Sign in</h2>
              </template>

              <form class="space-y-4" @submit.prevent="handleSignIn">
                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Email</label>
                  <UInput v-model="signInForm.email" type="email" required />
                </div>
                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Password</label>
                  <UInput v-model="signInForm.password" type="password" required />
                </div>
                <UButton
                  type="submit"
                  block
                  color="neutral"
                  variant="soft"
                  :loading="authAction.pending.value"
                >
                  Sign in
                </UButton>
              </form>
            </UCard>
          </div>
        </ConvexUnauthenticated>

        <ConvexAuthenticated>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 class="text-xl font-semibold">
                  {{ ctx?.displayName || user?.email || 'Signed in' }}
                </h2>
                <p v-if="role" class="text-sm text-muted">
                  Role:
                  <span class="font-semibold text-highlighted">{{ role }}</span>
                </p>
              </div>

              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                trailing-icon="i-lucide-log-out"
                @click="handleSignOut"
              >
                Sign out
              </UButton>
            </div>

            <UCard>
              <template #header>
                <h3 class="text-lg font-semibold">Permission matrix</h3>
                <p class="text-sm text-muted mt-1">
                  What each role can do. Your current role is highlighted.
                </p>
              </template>

              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-default">
                      <th class="text-left py-2 pr-4 font-medium text-muted">Action</th>
                      <th
                        v-for="r in allRoles"
                        :key="r"
                        class="text-center py-2 px-3 font-medium"
                        :class="r === role ? 'text-primary' : 'text-muted'"
                      >
                        {{ r }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in permissionMatrix"
                      :key="row.label"
                      class="border-b border-default last:border-0"
                    >
                      <td class="py-2 pr-4 text-highlighted">{{ row.label }}</td>
                      <td
                        v-for="r in allRoles"
                        :key="r"
                        class="text-center py-2 px-3"
                        :class="r === role ? 'font-semibold' : ''"
                      >
                        <span v-if="row.roles.includes(r)" class="text-success">yes</span>
                        <span v-else class="text-muted">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </UCard>

            <!-- Workspace onboarding -->
            <template v-if="!tenantId">
              <div class="grid gap-4 md:grid-cols-2">
                <UCard>
                  <template #header>
                    <h3 class="text-lg font-semibold">Create client workspace</h3>
                  </template>

                  <form class="space-y-4" @submit.prevent="handleCreateWorkspace">
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted">Workspace name</label>
                      <UInput v-model="createWorkspaceForm.name" required />
                    </div>
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted">Slug</label>
                      <UInput v-model="createWorkspaceForm.slug" required />
                    </div>
                    <UButton type="submit" block :loading="createWorkspace.pending.value">
                      Create workspace
                    </UButton>
                  </form>
                </UCard>

                <UCard>
                  <template #header>
                    <h3 class="text-lg font-semibold">Join client workspace</h3>
                  </template>

                  <form class="space-y-4" @submit.prevent="handleJoinWorkspace">
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted">Workspace slug</label>
                      <UInput v-model="joinWorkspaceForm.slug" required />
                    </div>
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted">Role</label>
                      <USelect v-model="joinWorkspaceForm.role" :items="roleOptions" />
                    </div>
                    <UButton
                      type="submit"
                      block
                      color="neutral"
                      variant="soft"
                      :loading="joinWorkspace.pending.value"
                    >
                      Join workspace
                    </UButton>
                  </form>
                </UCard>
              </div>
            </template>

            <!-- Workspace active -->
            <template v-else>
              <!-- Workspace switcher -->
              <UCard v-if="accessibleWorkspaces?.length">
                <template #header>
                  <h3 class="text-lg font-semibold">Accessible workspaces</h3>
                  <p class="text-sm text-muted mt-1">Switch between assigned client workspaces.</p>
                </template>

                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="workspace in accessibleWorkspaces"
                    :key="workspace.workspaceId"
                    :color="workspace.workspaceId === tenantId ? 'primary' : 'neutral'"
                    :variant="workspace.workspaceId === tenantId ? 'solid' : 'soft'"
                    @click="switchWorkspace({ workspaceId: workspace.workspaceId })"
                  >
                    {{ workspace.name }}
                    <UBadge
                      :color="workspace.role === 'member' ? 'info' : 'neutral'"
                      variant="subtle"
                      size="xs"
                      class="ml-1"
                    >
                      {{ workspace.role }}
                    </UBadge>
                  </UButton>
                </div>

                <div class="mt-3">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    leading-icon="i-lucide-database"
                    size="sm"
                    @click="seedAgencyPortfolio({})"
                  >
                    Seed agency portfolio
                  </UButton>
                </div>
              </UCard>

              <!-- Projects in current workspace -->
              <UCard>
                <template #header>
                  <h3 class="text-lg font-semibold">Projects</h3>
                  <p class="text-sm text-muted mt-1">
                    Projects in the current workspace. Scoped to the active tenant.
                  </p>
                </template>

                <div class="space-y-4">
                  <form
                    v-if="canCreateProject"
                    class="flex flex-col gap-3 md:flex-row md:items-end"
                    @submit.prevent="handleCreateProject"
                  >
                    <div class="flex-1 space-y-1">
                      <label class="text-sm font-medium text-highlighted">Project name</label>
                      <UInput v-model="projectForm.name" placeholder="Client rebrand" required />
                    </div>
                    <UButton
                      type="submit"
                      :loading="createProject.pending.value"
                      leading-icon="i-lucide-plus"
                    >
                      Create project
                    </UButton>
                  </form>

                  <div v-if="!projects?.length" class="text-sm text-muted py-4 text-center">
                    No projects in this workspace yet.
                  </div>

                  <ul class="space-y-2">
                    <li
                      v-for="project in projects"
                      :key="project._id"
                      class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-default bg-elevated"
                    >
                      <span class="font-medium text-highlighted">{{ project.name }}</span>
                      <UBadge
                        :color="project.status === 'active' ? 'success' : 'neutral'"
                        variant="subtle"
                        size="xs"
                      >
                        {{ project.status }}
                      </UBadge>
                    </li>
                  </ul>
                </div>
              </UCard>

              <!-- Agency portfolio dashboard -->
              <UCard v-if="canDashboard">
                <template #header>
                  <h3 class="text-lg font-semibold">Agency Portfolio</h3>
                  <p class="text-sm text-muted mt-1">
                    Cross-client view. Only shows assigned clients, without weakening the normal
                    tenant boundary.
                  </p>
                </template>

                <div v-if="!portfolio?.length" class="text-sm text-muted py-4 text-center">
                  No assigned clients yet. Seed the portfolio to see data.
                </div>

                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div
                    v-for="entry in portfolio"
                    :key="entry.workspace.id"
                    class="rounded-xl border border-default bg-elevated p-4"
                  >
                    <p class="font-semibold text-highlighted">{{ entry.workspace.name }}</p>
                    <p class="text-sm text-muted mt-1">
                      Active projects:
                      <span class="font-semibold text-highlighted">{{ entry.activeProjects }}</span>
                    </p>
                  </div>
                </div>
              </UCard>

              <UAlert v-if="projectError" color="error" :title="projectError" />
            </template>
          </div>
        </ConvexAuthenticated>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'

import { api } from '#trellis/api'
import { agencyPermissionKeys } from '~/shared/permissions'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, ctx, role, tenantId } = usePermissions()
const canCreateProject = can(agencyPermissionKeys.projectCreate)
const canDashboard = can(agencyPermissionKeys.agencyDashboard)
const allRoles = ['owner', 'member', 'viewer', 'agency_admin', 'agency_manager'] as const
const permissionMatrix = [
  { label: 'Create project', roles: ['owner', 'member'] },
  { label: 'Read projects', roles: ['owner', 'member', 'viewer'] },
  { label: 'Agency dashboard', roles: ['agency_admin', 'agency_manager'] },
  { label: 'Switch workspace', roles: ['owner', 'member', 'viewer', 'agency_admin', 'agency_manager'] },
]

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
const { data: accessibleWorkspaces } = await useConvexQuery(
  api.workspaces.listAccessibleWorkspaces,
  workspaceArgs,
)
const { data: projects, error: projectsError } = await useConvexQuery(
  api.projects.list,
  workspaceArgs,
)
const { data: portfolio } = await useConvexQuery(
  api.dashboard.portfolio,
  computed(() => (canDashboard.value ? {} : undefined)),
)

const projectError = computed(
  () =>
    projectsError.value?.message ||
    createProject.error.value?.message ||
    switchWorkspace.error.value?.message ||
    '',
)

const roleOptions = ['member', 'viewer'] as const

async function handleSignUp() {
  await authAction.execute(() => client.signUp.email(signUpForm), { redirectTo: '/' })
}

async function handleSignIn() {
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
  projectForm.name = ''
}
</script>
