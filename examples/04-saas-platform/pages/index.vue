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
                  v-if="tenantId"
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
                        This list is paginated because real lists get long. The page still stays
                        live after the first load.
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
                      leading-icon="i-lucide-plus"
                    >
                      Create project
                    </UButton>
                  </form>

                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <NuxtLink
                      v-for="project in projects"
                      :key="project._id"
                      :data-testid="`project-link-${project._id}`"
                      class="block rounded-xl border border-default bg-elevated p-4 hover:border-primary transition-colors"
                      :to="`/projects/${project._id}`"
                    >
                      <p class="font-semibold text-highlighted">{{ project.name }}</p>
                      <p class="text-sm text-muted mt-1">
                        {{ project.summary || 'No summary yet.' }}
                      </p>
                    </NuxtLink>
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

import { api } from '~/convex/_generated/api'
import { saasPermissionKeys } from '~/shared/permissions'

const { client, signOut, user } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, ready, role, tenantId, ctx } = usePermissions()
const canAudit = can(saasPermissionKeys.workspaceAudit)

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

const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)
const createProject = useConvexMutation(api.projects.create)

const { data: workspaceOptions } = await useConvexQuery(api.workspaces.listWorkspaces, {})

const projectArgs = computed(() => (tenantId.value ? {} : undefined))
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
const canCreateProject = can(saasPermissionKeys.projectCreate)
const roleOptions = ['admin', 'member', 'viewer'] as const

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
