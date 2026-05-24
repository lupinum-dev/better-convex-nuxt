<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-green-50 to-white dark:from-green-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-5xl">
      <template #header>
        <p class="text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">
          Example 04
        </p>
        <h1 class="text-3xl font-bold mt-1">Server Integration Workspace</h1>
        <p class="text-sm text-muted mt-2">
          The final beginner-ladder example: protected workspace patterns plus Nitro routes,
          uploads, and one verified external integration boundary.
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
                </div>
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

            <template v-if="ready && !workspaceId">
              <UCard>
                <template #header>
                  <h3 class="text-lg font-semibold">Create workspace</h3>
                  <p class="text-sm text-muted mt-1">
                    The creator becomes the workspace owner. This example no longer ships open
                    self-join because role assignment is an authorization boundary, not onboarding
                    UI.
                  </p>
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
            </template>

            <template v-if="workspaceId">
              <UCard>
                <template #header>
                  <div>
                    <h3 class="text-lg font-semibold">Projects</h3>
                    <p class="text-sm text-muted mt-1">
                      Paginated and live — the list stays reactive even after loading more pages.
                    </p>
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
import { computed, reactive } from 'vue'

import { api } from '#trellis/api'
import {
  commentPermissionMatrix,
  projectCreate,
  projectPermissionMatrix,
  taskPermissionMatrix,
} from '#trellis/permissions'

const toast = useToast()
const { sessionUser, signOut } = useConvexAuth()
const client = useBetterAuthClient()
const authAction = useBetterAuthActions()
const { can, ready, role, workspaceId, ctx } = useAccess()

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

const projectForm = reactive({
  name: '',
  summary: '',
})

const createWorkspace = useConvexMutation(api.features.workspaces.domain.createWorkspaceMutation, {
  onSuccess: () =>
    toast.add({ title: 'Workspace created', color: 'success', icon: 'i-lucide-building' }),
  onError: (error) =>
    toast.add({ title: 'Could not create workspace', description: error.message, color: 'error' }),
})
const createProject = useConvexMutation(api.features.projects.domain.create, {
  onSuccess: () =>
    toast.add({ title: 'Project created', color: 'success', icon: 'i-lucide-folder-plus' }),
  onError: (error) =>
    toast.add({
      title: 'Cannot create project',
      description: error.message,
      color: 'error',
    }),
})
const projectArgs = computed(() => (workspaceId.value ? {} : undefined))
const {
  results: projects,
  status: projectStatus,
  loadMore: loadMoreProjects,
  error: projectError,
} = await useConvexPaginatedQuery(api.features.projects.domain.list, projectArgs, {
  initialNumItems: 12,
})

const displayName = computed(
  () =>
    ctx.value?.displayName ||
    sessionUser.value?.displayName ||
    sessionUser.value?.email ||
    'Signed in',
)
const currentWorkspace = computed(() => ctx.value?.workspace ?? null)
const canCreateProject = can(projectCreate)
const allRoles = ['owner', 'admin', 'member', 'viewer'] as const
const recordRuleRows = [
  { label: 'Update own task', roles: ['owner', 'admin', 'member'] },
  { label: 'Delete own task', roles: ['owner', 'admin', 'member'] },
]
const permissionMatrix = [
  ...projectPermissionMatrix,
  ...taskPermissionMatrix,
  ...commentPermissionMatrix,
  ...recordRuleRows,
]

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

async function handleCreateProject() {
  await createProject({
    name: projectForm.name,
    summary: projectForm.summary || undefined,
  })
  projectForm.name = ''
  projectForm.summary = ''
}
</script>
