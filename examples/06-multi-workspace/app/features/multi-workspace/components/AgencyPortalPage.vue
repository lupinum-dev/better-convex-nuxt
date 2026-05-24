<!--
Why this file exists:
The multi-workspace upgrade path keeps auth, workspace switching, and agency overview together
while current-workspace project actions stay behind their own feature API.
-->
<template>
  <div
    class="min-h-screen flex items-center justify-center bg-linear-to-br from-purple-50 to-white p-6 dark:from-purple-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-5xl">
      <template #header>
        <p class="text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-400">
          Example 06
        </p>
        <h1 class="mt-1 text-3xl font-bold">Multi-Workspace Agency Portal</h1>
        <p class="mt-2 text-sm text-muted">
          The upgrade branch for teams that outgrow a single-workspace user model. Current-workspace
          actions stay normal; cross-workspace views stay explicitly limited.
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
                <h2 class="text-xl font-semibold">{{ displayName }}</h2>
                <template v-if="workspaceId">
                  <p class="text-sm text-muted">
                    Role:
                    <span class="font-semibold text-highlighted">{{ role }}</span>
                    <template v-if="currentWorkspaceName">
                      · Workspace:
                      <span class="font-semibold text-highlighted">{{ currentWorkspaceName }}</span>
                    </template>
                  </p>
                </template>
                <p v-else class="text-sm text-muted">No workspace yet - create one below.</p>
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
                <p class="mt-1 text-sm text-muted">
                  What each role can do. Your current role is highlighted.
                </p>
              </template>

              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-default">
                      <th class="py-2 pr-4 text-left font-medium text-muted">Action</th>
                      <th
                        v-for="membershipRole in allRoles"
                        :key="membershipRole"
                        class="py-2 px-3 text-center font-medium"
                        :class="membershipRole === role ? 'text-primary' : 'text-muted'"
                      >
                        {{ membershipRole }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="permission in permissionMatrix"
                      :key="permission.label"
                      class="border-b border-default last:border-0"
                    >
                      <td class="py-2 pr-4 text-highlighted">{{ permission.label }}</td>
                      <td
                        v-for="membershipRole in allRoles"
                        :key="membershipRole"
                        class="py-2 px-3 text-center"
                        :class="membershipRole === role ? 'font-semibold' : ''"
                      >
                        <span v-if="permission.roles.includes(membershipRole)" class="text-success">
                          yes
                        </span>
                        <span v-else class="text-muted">-</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="text-lg font-semibold">When to stay on 03 vs move to 06</h3>
                <p class="mt-1 text-sm text-muted">
                  This example is the architectural fork, not the default starting point.
                </p>
              </template>

              <div class="grid gap-3 lg:grid-cols-2">
                <div class="rounded-xl border border-default bg-elevated p-4">
                  <p class="text-sm font-semibold text-highlighted">Stay on Example 03</p>
                  <p class="mt-2 text-sm text-muted">
                    One user belongs to one workspace, tenant context never switches, and all views
                    live inside that single boundary.
                  </p>
                </div>
                <div class="rounded-xl border border-default bg-elevated p-4">
                  <p class="text-sm font-semibold text-highlighted">Move to Example 06</p>
                  <p class="mt-2 text-sm text-muted">
                    Users need explicit memberships, an active workspace selector, or a carefully
                    limited cross-workspace portfolio surface.
                  </p>
                </div>
              </div>
            </UCard>

            <WorkspaceOnboarding v-if="!workspaceId" />

            <template v-else>
              <WorkspaceSwitcher
                :workspaces="accessibleWorkspaces"
                :current-tenant-id="workspaceId"
                :seed-loading="seedAgencyPortfolio.pending.value"
                @switch="handleSwitchWorkspace"
                @seed="handleSeed"
              />

              <MemberList :members="members" />

              <ProjectSummary :projects="projects" />

              <AgencyPortfolio v-if="canDashboard" :portfolio="portfolio" />
            </template>
          </div>
        </ConvexAuthenticated>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#trellis/api'
import { projectPermissionMatrix } from '#trellis/permissions'

import AgencyPortfolio from './AgencyPortfolio.vue'
import MemberList from './MemberList.vue'
import ProjectSummary from './ProjectSummary.vue'
import WorkspaceOnboarding from './WorkspaceOnboarding.vue'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'

const { sessionUser, signOut } = useConvexAuth()
const client = useBetterAuthClient()
const authAction = useBetterAuthActions()
const toast = useToast()
const { ctx, role, workspaceId } = useAccess()
const canDashboard = computed(() => ctx.value?.agencyDashboard === true)

const allRoles = ['owner', 'member', 'viewer', 'agency_admin', 'agency_manager'] as const
const recordRuleRows = [
  { label: 'Toggle project status', roles: ['owner', 'member'] },
  { label: 'Agency dashboard', roles: ['agency_admin', 'agency_manager'] },
  {
    label: 'Switch workspace',
    roles: ['owner', 'member', 'viewer', 'agency_admin', 'agency_manager'],
  },
]
const permissionMatrix = [...projectPermissionMatrix, ...recordRuleRows]

const signUpForm = reactive({ name: '', email: '', password: '' })
const signInForm = reactive({ email: '', password: '' })

const switchWorkspace = useConvexMutation(api.features.workspaces.domain.switchWorkspace, {
  onSuccess: () => toast.add({ title: 'Workspace switched', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not switch workspace', description: error.message, color: 'error' }),
})
const seedAgencyPortfolio = useConvexMutation(
  api.features.workspaces.domain.seedAgencyPortfolioMutation,
  {
    onSuccess: () => toast.add({ title: 'Agency portfolio seeded', color: 'success' }),
    onError: (error) =>
      toast.add({ title: 'Could not seed portfolio', description: error.message, color: 'error' }),
  },
)

const workspaceArgs = computed(() => (workspaceId.value ? {} : undefined))
const { data: accessibleWorkspaces } = await useConvexQuery(
  api.features.workspaces.domain.listAccessibleWorkspaces,
  computed(() => (user.value ? {} : undefined)),
)
const { data: projects } = await useConvexQuery(api.features.projects.domain.list, workspaceArgs)
const { data: members } = await useConvexQuery(
  api.features.memberships.domain.listMembers,
  workspaceArgs,
)
const { data: portfolio } = await useConvexQuery(
  api.features.dashboard.domain.portfolio,
  computed(() => (canDashboard.value ? {} : undefined)),
)

const displayName = computed(
  () =>
    ctx.value?.displayName ||
    sessionUser.value?.displayName ||
    sessionUser.value?.email ||
    'Signed in',
)
const currentWorkspaceName = computed(() => {
  if (!workspaceId.value || !accessibleWorkspaces.value) return null
  return (
    accessibleWorkspaces.value.find(
      (workspace: { workspaceId: string; name: string }) =>
        workspace.workspaceId === workspaceId.value,
    )?.name ?? null
  )
})

async function handleSignUp() {
  await authAction.execute(() => client!.signUp.email(signUpForm), { redirectTo: '/' })
}

async function handleSignIn() {
  await authAction.execute(() => client!.signIn.email(signInForm), { redirectTo: '/' })
}

async function handleSignOut() {
  await signOut()
}

async function handleSwitchWorkspace(workspaceId: Id<'workspaces'>) {
  await switchWorkspace({ workspaceId })
}

async function handleSeed() {
  await seedAgencyPortfolio({})
}
</script>
