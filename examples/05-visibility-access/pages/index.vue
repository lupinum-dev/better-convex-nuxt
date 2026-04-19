<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-5xl">
      <template #header>
        <p class="text-xs font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-400">
          Example 05
        </p>
        <h1 class="text-3xl font-bold mt-1">Team Knowledge Base</h1>
        <p class="text-sm text-muted mt-2">
          Row-level visibility, field redaction, enrollment-based access, prerequisite chains, share
          tokens, and inherited access levels in a single knowledge base domain.
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
                    <span class="font-semibold text-highlighted">{{ role || 'loading...' }}</span>
                  </p>
                  <p v-if="currentWorkspaceName" class="text-sm text-muted">
                    Workspace:
                    <span class="font-semibold text-highlighted">{{ currentWorkspaceName }}</span>
                  </p>
                </template>
                <p v-else class="text-sm text-muted">
                  No workspace yet — create or join one below.
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
                    <h3 class="text-lg font-semibold">Create workspace</h3>
                    <p class="text-sm text-muted mt-1">The creator becomes the workspace owner.</p>
                  </template>

                  <form class="space-y-4" @submit.prevent="handleCreateWorkspace">
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted">Name</label>
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
                    <h3 class="text-lg font-semibold">Join workspace</h3>
                    <p class="text-sm text-muted mt-1">
                      Open join so you can test different roles quickly.
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
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted"
                        >Manager email (optional)</label
                      >
                      <UInput
                        v-model="joinWorkspaceForm.managerEmail"
                        type="email"
                        placeholder="editor@example.com"
                      />
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

            <!-- Knowledge bases -->
            <template v-if="tenantId">
              <UCard>
                <template #header>
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 class="text-lg font-semibold">Knowledge Bases</h3>
                      <p class="text-sm text-muted mt-1">
                        Each knowledge base contains articles with visibility, enrollment, and
                        prerequisites.
                      </p>
                    </div>
                  </div>
                </template>

                <div class="space-y-4">
                  <form
                    v-if="canCreate"
                    class="flex flex-col gap-3 md:flex-row md:items-end"
                    @submit.prevent="handleCreateKB"
                  >
                    <div class="flex-1 space-y-1">
                      <label class="text-sm font-medium text-highlighted">Title</label>
                      <UInput v-model="kbForm.title" placeholder="Engineering Handbook" required />
                    </div>
                    <UButton
                      type="submit"
                      :loading="createKB.pending.value"
                      leading-icon="i-lucide-plus"
                    >
                      Create
                    </UButton>
                  </form>

                  <div
                    v-if="!knowledgeBases?.length"
                    class="flex flex-col items-center gap-2 py-8 text-muted"
                  >
                    <UIcon name="i-lucide-book-open" class="w-8 h-8" />
                    <p class="text-sm">No knowledge bases yet.</p>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <NuxtLink
                      v-for="kb in knowledgeBases"
                      :key="kb._id"
                      :to="`/kb/${kb._id}`"
                      class="block rounded-xl border border-default bg-elevated p-4 hover:border-primary transition-colors"
                    >
                      <div class="flex items-center gap-2">
                        <p class="font-semibold text-highlighted">{{ kb.title }}</p>
                        <UBadge
                          :color="kb.status === 'published' ? 'success' : 'warning'"
                          variant="subtle"
                          size="xs"
                        >
                          {{ kb.status }}
                        </UBadge>
                      </div>
                    </NuxtLink>
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
import { knowledgeBasePermissionKeys } from '~/shared/permissions'

const { client, signOut, user } = useConvexAuth()
const authAction = useConvexAuthActions()
const toast = useToast()
const { allows, ctx, ready, role, tenantId } = usePermissions()

const signUpForm = reactive({ name: '', email: '', password: '' })
const signInForm = reactive({ email: '', password: '' })
const createWorkspaceForm = reactive({ name: '', slug: '' })
const joinWorkspaceForm = reactive({
  slug: '',
  role: 'contributor' as 'admin' | 'editor' | 'contributor' | 'viewer',
  managerEmail: '',
})
const kbForm = reactive({ title: '' })

const createWorkspace = useConvexMutation(api.domain.workspaces.createWorkspace, {
  onSuccess: () => toast.add({ title: 'Workspace created', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not create workspace', description: error.message, color: 'error' }),
})
const joinWorkspace = useConvexMutation(api.domain.workspaces.joinWorkspace, {
  onSuccess: () => toast.add({ title: 'Joined workspace', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not join workspace', description: error.message, color: 'error' }),
})
const createKB = useConvexMutation(api.domain.knowledgeBases.create, {
  onSuccess: () => toast.add({ title: 'Knowledge base created', color: 'success' }),
  onError: (error) =>
    toast.add({
      title: 'Could not create knowledge base',
      description: error.message,
      color: 'error',
    }),
})

const { data: workspaceOptions } = await useConvexQuery(api.domain.workspaces.listWorkspaces, {})

const kbArgs = computed(() => (tenantId.value ? {} : undefined))
const { data: knowledgeBases } = await useConvexQuery(api.domain.knowledgeBases.list, kbArgs)

const displayName = computed(
  () => ctx.value?.displayName || user.value?.name || user.value?.email || 'Signed in',
)
const currentWorkspaceName = computed(() => {
  if (!tenantId.value || !workspaceOptions.value) return null
  return workspaceOptions.value.find((w) => w._id === tenantId.value)?.name ?? null
})
const canCreate = allows(knowledgeBasePermissionKeys.kbCreate)
const roleOptions = ['admin', 'editor', 'contributor', 'viewer']
const allRoles = ['owner', 'admin', 'editor', 'contributor', 'viewer'] as const
const permissionMatrix = [
  { label: 'Create knowledge base', roles: ['owner', 'admin', 'editor'] },
  { label: 'Read knowledge base', roles: ['owner', 'admin', 'editor', 'contributor', 'viewer'] },
  { label: 'Create article', roles: ['owner', 'admin', 'editor', 'contributor'] },
  { label: 'Read articles', roles: ['owner', 'admin', 'editor', 'contributor', 'viewer'] },
  { label: 'Update any article', roles: ['owner', 'admin'] },
  { label: 'Update own article', roles: ['owner', 'admin', 'editor', 'contributor'] },
  { label: 'Manage enrollments', roles: ['owner', 'admin', 'editor'] },
  { label: 'Create share token', roles: ['owner', 'admin', 'editor'] },
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

async function handleJoinWorkspace() {
  await joinWorkspace({
    slug: joinWorkspaceForm.slug,
    role: joinWorkspaceForm.role,
    managerEmail: joinWorkspaceForm.managerEmail || undefined,
  })
}

async function handleCreateKB() {
  await createKB({ title: kbForm.title })
  kbForm.title = ''
}
</script>
