<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-green-50 to-white dark:from-green-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-5xl">
      <template #header>
        <p class="text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">
          Example 04
        </p>
        <h1 class="text-3xl font-bold mt-1">SaaS Platform</h1>
        <p class="text-sm text-muted mt-2">
          The month-two app: paginated lists, uploads, server routes, role management, plan
          entitlements, and usage limits on top of the same explicit auth pattern used in Example
          03.
        </p>
      </template>

      <div class="space-y-4">
        <ConvexAuthLoading>
          <div class="space-y-3">
            <p class="text-sm text-muted">Checking your session…</p>
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
                <h2 class="text-xl font-semibold">{{ displayName }}</h2>
                <p v-if="currentWorkspace" class="text-sm text-muted">
                  {{ currentWorkspace.name }}
                </p>
                <div class="flex items-center gap-2 mt-1">
                  <p class="text-sm text-muted">
                    Role:
                    <span class="font-semibold text-highlighted">{{ role || 'loading…' }}</span>
                  </p>
                  <UBadge
                    v-if="ctx?.plan"
                    :color="ctx.plan === 'free' ? 'neutral' : 'success'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ ctx.plan }}
                  </UBadge>
                  <span v-if="ctx?.usage?.projects" class="text-xs text-muted">
                    {{ ctx.usage.projects.current }}/{{
                      ctx.usage.projects.max === Infinity ? '∞' : ctx.usage.projects.max
                    }}
                    projects
                  </span>
                </div>
              </div>

              <div class="flex gap-2">
                <UButton
                  v-if="canAudit"
                  to="/admin"
                  color="neutral"
                  variant="ghost"
                  leading-icon="i-lucide-shield"
                >
                  Admin
                </UButton>
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
            </div>

            <UCard>
              <template #header>
                <h3 class="text-lg font-semibold">Permission matrix</h3>
                <p class="text-sm text-muted mt-1">
                  What each role can do in this workspace. Your current role is highlighted.
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

            <template v-if="ready && !tenantId">
              <div class="grid gap-4 md:grid-cols-2">
                <UCard>
                  <template #header>
                    <h3 class="text-lg font-semibold">Create workspace</h3>
                    <p class="text-sm text-muted mt-1">The creator becomes the workspace owner.</p>
                  </template>

                  <form class="space-y-4" @submit.prevent="handleCreateWorkspace">
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted">Name</label>
                      <UInput
                        v-model="createWorkspaceForm.name"
                        data-testid="workspace-name"
                        required
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted">Slug</label>
                      <UInput
                        v-model="createWorkspaceForm.slug"
                        data-testid="workspace-slug"
                        required
                      />
                    </div>
                    <UButton
                      data-testid="workspace-submit"
                      type="submit"
                      block
                      :loading="createWorkspace.pending.value"
                    >
                      Create workspace
                    </UButton>
                  </form>
                </UCard>

                <UCard>
                  <template #header>
                    <h3 class="text-lg font-semibold">Join workspace</h3>
                    <p class="text-sm text-muted mt-1">
                      This demo keeps joining intentionally open so you can quickly test different
                      roles.
                    </p>
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

              <UCard v-if="workspaceOptions?.length">
                <template #header>
                  <h3 class="text-lg font-semibold">Existing workspaces</h3>
                  <p class="text-sm text-muted mt-1">
                    Use one of these slugs to join from another account.
                  </p>
                </template>

                <ul class="space-y-2">
                  <li
                    v-for="workspace in workspaceOptions"
                    :key="workspace._id"
                    class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-default bg-elevated"
                  >
                    <span class="font-medium text-highlighted">{{ workspace.name }}</span>
                    <span class="text-sm text-muted">{{ workspace.slug }}</span>
                  </li>
                </ul>
              </UCard>
            </template>

            <template v-if="tenantId">
              <UCard>
                <template #header>
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 class="text-lg font-semibold">Projects</h3>
                      <p class="text-sm text-muted mt-1">
                        Paginated and live — the list stays reactive even after loading more pages.
                      </p>
                    </div>
                    <UButton
                      v-if="canAudit"
                      to="/admin"
                      color="neutral"
                      variant="ghost"
                      leading-icon="i-lucide-layout-dashboard"
                    >
                      Open admin dashboard
                    </UButton>
                  </div>
                </template>

                <div class="space-y-4">
                  <form
                    v-if="canCreateProject"
                    class="flex flex-col gap-3 md:flex-row md:items-end"
                    @submit.prevent="handleCreateProject"
                  >
                    <div class="flex-1 space-y-1">
                      <label class="text-sm font-medium text-highlighted">Project name</label>
                      <UInput
                        v-model="projectForm.name"
                        data-testid="project-name"
                        placeholder="Launch board refresh"
                        required
                      />
                    </div>
                    <div class="flex-1 space-y-1">
                      <label class="text-sm font-medium text-highlighted">Summary</label>
                      <UInput
                        v-model="projectForm.summary"
                        placeholder="One-line context for the team"
                      />
                    </div>
                    <UButton
                      data-testid="project-submit"
                      type="submit"
                      :loading="createProject.pending.value"
                      :disabled="atProjectLimit"
                      leading-icon="i-lucide-plus"
                    >
                      Create project
                    </UButton>
                  </form>
                  <p v-if="canCreateProject && atProjectLimit" class="text-xs text-warning">
                    Plan limit reached.
                    <NuxtLink to="/admin" class="underline">Upgrade your plan</NuxtLink>
                    to add more projects.
                  </p>

                  <UAlert
                    v-if="projectError"
                    color="error"
                    variant="soft"
                    icon="i-lucide-circle-alert"
                    :description="projectError.message"
                  />

                  <div
                    v-if="projectStatus === 'loading-first-page'"
                    class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    <USkeleton v-for="i in 3" :key="i" class="h-24 rounded-xl" />
                  </div>
                  <div
                    v-else-if="projects?.length"
                    class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    <NuxtLink
                      v-for="project in projects"
                      :key="project._id"
                      :data-testid="`project-link-${project._id}`"
                      class="block rounded-xl border border-default p-4 transition-colors"
                      :class="
                        project.status === 'archived'
                          ? 'bg-default opacity-60'
                          : 'bg-elevated hover:border-primary'
                      "
                      :to="`/projects/${project._id}`"
                    >
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <p class="font-semibold text-highlighted truncate">{{ project.name }}</p>
                        <UBadge
                          v-if="project.status === 'archived'"
                          size="xs"
                          color="neutral"
                          variant="subtle"
                        >
                          archived
                        </UBadge>
                      </div>
                      <p class="text-sm text-muted">
                        {{ project.summary || 'No summary yet.' }}
                      </p>
                    </NuxtLink>
                  </div>
                  <div v-else class="text-center py-12">
                    <span class="iconify i-lucide-folder-open text-4xl text-muted" />
                    <p class="text-muted mt-2">No projects yet.</p>
                  </div>

                  <div class="flex justify-center">
                    <UButton
                      v-if="projectStatus === 'ready'"
                      data-testid="projects-load-more"
                      color="neutral"
                      variant="ghost"
                      @click="loadMoreProjects(12)"
                    >
                      Load more
                    </UButton>
                    <p v-if="projectStatus === 'exhausted'" class="text-sm text-muted">
                      All projects loaded.
                    </p>
                  </div>
                </div>
              </UCard>
            </template>
          </div>
        </ConvexAuthenticated>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * Example 04 keeps onboarding, project creation, and pagination on one page so the jump into the
 * board stays fast. This is where users see the progression from auth -> workspace -> real feature work.
 */
import { computed, reactive, ref } from 'vue'

import { api } from '#trellis/api'
import { projectCreate, saasPermissionMatrix, workspaceAudit } from '~/convex/auth/permissions'

const toast = useToast()
const { client, signOut, user } = useConvexAuth()
const authAction = useConvexAuthActions()
const { allows, ready, role, tenantId, ctx } = usePermissions()
const canAudit = allows(workspaceAudit)

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

const createWorkspace = useConvexMutation(api.domain.workspaces.createWorkspace, {
  onSuccess: () =>
    toast.add({ title: 'Workspace created', color: 'success', icon: 'i-lucide-building' }),
  onError: (error) =>
    toast.add({ title: 'Could not create workspace', description: error.message, color: 'error' }),
})
const joinWorkspace = useConvexMutation(api.domain.workspaces.joinWorkspace, {
  onSuccess: () =>
    toast.add({ title: 'Joined workspace', color: 'success', icon: 'i-lucide-user-plus' }),
  onError: (error) =>
    toast.add({ title: 'Could not join workspace', description: error.message, color: 'error' }),
})
const createProject = useConvexMutation(api.domain.projects.create, {
  onSuccess: () =>
    toast.add({ title: 'Project created', color: 'success', icon: 'i-lucide-folder-plus' }),
  onError: (error) => {
    const isLimitError = error.message.includes('Plan limit')
    toast.add({
      title: 'Cannot create project',
      description: error.message,
      color: 'error',
      actions: isLimitError
        ? [
            {
              label: 'Go to Admin',
              color: 'error' as const,
              onClick: () => {
                void navigateTo('/admin')
              },
            },
          ]
        : undefined,
    })
  },
})

const { data: workspaceOptions } = await useConvexQuery(api.domain.workspaces.listWorkspaces, {})

const projectArgs = computed(() => (tenantId.value ? {} : undefined))
const {
  results: projects,
  status: projectStatus,
  loadMore: loadMoreProjects,
  error: projectError,
} = await useConvexPaginatedQuery(api.domain.projects.list, projectArgs, {
  initialNumItems: 12,
})

const displayName = computed(
  () => ctx.value?.displayName || user.value?.name || user.value?.email || 'Signed in',
)
const currentWorkspace = computed(() =>
  workspaceOptions.value?.find((w) => w._id === tenantId.value),
)
const canCreateProject = allows(projectCreate)
const atProjectLimit = computed(() => ctx.value?.usage?.projects?.remaining === 0)
const roleOptions = ['admin', 'member', 'viewer']
const allRoles = ['owner', 'admin', 'member', 'viewer'] as const
const recordRuleRows = [
  { label: 'Update own task', roles: ['owner', 'admin', 'member'] },
  { label: 'Delete own task', roles: ['owner', 'admin', 'member'] },
]
const permissionMatrix = [...saasPermissionMatrix, ...recordRuleRows]

async function handleSignUp() {
  await authAction.execute(() => client!.signUp.email(signUpForm), { redirectTo: '/' })
}

async function handleSignIn() {
  await authAction.execute(() => client!.signIn.email(signInForm), { redirectTo: '/' })
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
