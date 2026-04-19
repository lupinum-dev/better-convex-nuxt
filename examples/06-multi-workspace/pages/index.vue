<!--
Why this file exists:
The multi-workspace upgrade path — auth, workspace switching, and agency overview in one place.
Project management lives on its own page so the cross-workspace boundary stays explicit.
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
                <template v-if="tenantId">
                  <p class="text-sm text-muted">
                    Role:
                    <span class="font-semibold text-highlighted">{{ role }}</span>
                    <template v-if="currentWorkspaceName">
                      &middot; Workspace:
                      <span class="font-semibold text-highlighted">{{ currentWorkspaceName }}</span>
                    </template>
                  </p>
                </template>
                <p v-else class="text-sm text-muted">
                  No workspace yet — create one below.
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
            <WorkspaceOnboarding v-if="!tenantId" />

            <!-- Workspace active -->
            <template v-else>
              <WorkspaceSwitcher
                :workspaces="accessibleWorkspaces"
                :current-tenant-id="tenantId"
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

import { api } from '#trellis/api'
import { agencyPermissionMatrix } from '~/convex/auth/permissions'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const toast = useToast()
const { allows, ctx, role, tenantId } = usePermissions()
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
const permissionMatrix = [...agencyPermissionMatrix, ...recordRuleRows]

const signUpForm = reactive({ name: '', email: '', password: '' })
const signInForm = reactive({ email: '', password: '' })

const switchWorkspace = useConvexMutation(api.domain.workspaces.switchWorkspace, {
  onSuccess: () => toast.add({ title: 'Workspace switched', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not switch workspace', description: error.message, color: 'error' }),
})
const seedAgencyPortfolio = useConvexMutation(api.domain.workspaces.seedAgencyPortfolio, {
  onSuccess: () => toast.add({ title: 'Agency portfolio seeded', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not seed portfolio', description: error.message, color: 'error' }),
})

const workspaceArgs = computed(() => (tenantId.value ? {} : undefined))
const { data: accessibleWorkspaces } = await useConvexQuery(
  api.domain.workspaces.listAccessibleWorkspaces,
  computed(() => (user.value ? {} : undefined)),
)
const { data: projects } = await useConvexQuery(api.domain.projects.list, workspaceArgs)
const { data: members } = await useConvexQuery(api.domain.workspaces.listMembers, workspaceArgs)
const { data: portfolio } = await useConvexQuery(
  api.domain.dashboard.portfolio,
  computed(() => (canDashboard.value ? {} : undefined)),
)

const displayName = computed(
  () => ctx.value?.displayName || user.value?.name || user.value?.email || 'Signed in',
)
const currentWorkspaceName = computed(() => {
  if (!tenantId.value || !accessibleWorkspaces.value) return null
  return accessibleWorkspaces.value.find((w) => w.workspaceId === tenantId.value)?.name ?? null
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

async function handleSwitchWorkspace(workspaceId: string) {
  await switchWorkspace({ workspaceId: workspaceId as any })
}

async function handleSeed() {
  await seedAgencyPortfolio({})
}
</script>
