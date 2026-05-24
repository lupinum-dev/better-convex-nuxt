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
          The advanced authorization branch: row visibility, field redaction, enrollment,
          prerequisites, share tokens, and inherited access in one domain.
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
                    <span class="font-semibold text-highlighted">{{ role || 'loading...' }}</span>
                  </p>
                  <p v-if="currentWorkspaceName" class="text-sm text-muted">
                    Workspace:
                    <span class="font-semibold text-highlighted">{{ currentWorkspaceName }}</span>
                  </p>
                </template>
                <p v-else class="text-sm text-muted">
                  No workspace yet — create one below. Invite-based collaboration belongs on a
                  server-owned flow, so this example no longer ships open self-join.
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

            <UCard>
              <template #header>
                <h3 class="text-lg font-semibold">Authorization map</h3>
                <p class="text-sm text-muted mt-1">
                  Read this example as an access pipeline, not a generic content app.
                </p>
              </template>

              <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div class="rounded-xl border border-default bg-elevated p-4">
                  <p class="text-sm font-semibold text-highlighted">Row visibility</p>
                  <p class="mt-2 text-sm text-muted">
                    The index decides which articles even exist for a caller before field-level
                    rules matter.
                  </p>
                </div>
                <div class="rounded-xl border border-default bg-elevated p-4">
                  <p class="text-sm font-semibold text-highlighted">Enrollment + prerequisites</p>
                  <p class="mt-2 text-sm text-muted">
                    Access can depend on knowledge-base membership and completion of earlier
                    articles, not just role names.
                  </p>
                </div>
                <div class="rounded-xl border border-default bg-elevated p-4">
                  <p class="text-sm font-semibold text-highlighted">
                    Field redaction + share links
                  </p>
                  <p class="mt-2 text-sm text-muted">
                    Even when a row is visible, sensitive fields and alternate share-token auth stay
                    separate decisions.
                  </p>
                </div>
              </div>
            </UCard>

            <!-- Workspace onboarding -->
            <template v-if="!workspaceId">
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
            </template>

            <!-- Knowledge bases -->
            <template v-if="workspaceId">
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
import {
  articlePermissionMatrix,
  kbCreate,
  knowledgeBasePermissionMatrix,
} from '#trellis/permissions'

const { sessionUser, signOut } = useConvexAuth()
const client = useBetterAuthClient()
const authAction = useBetterAuthActions()
const toast = useToast()
const { can, ctx, ready, role, workspaceId } = useAccess()

const signUpForm = reactive({ name: '', email: '', password: '' })
const signInForm = reactive({ email: '', password: '' })
const createWorkspaceForm = reactive({ name: '', slug: '' })
const kbForm = reactive({ title: '' })

const createWorkspace = useConvexMutation(api.features.workspaces.domain.createWorkspaceMutation, {
  onSuccess: () => toast.add({ title: 'Workspace created', color: 'success' }),
  onError: (error) =>
    toast.add({ title: 'Could not create workspace', description: error.message, color: 'error' }),
})
const createKB = useConvexMutation(api.features.knowledgeBases.domain.create, {
  onSuccess: () => toast.add({ title: 'Knowledge base created', color: 'success' }),
  onError: (error) =>
    toast.add({
      title: 'Could not create knowledge base',
      description: error.message,
      color: 'error',
    }),
})
const kbArgs = computed(() => (workspaceId.value ? {} : undefined))
const { data: knowledgeBases } = await useConvexQuery(
  api.features.knowledgeBases.domain.list,
  kbArgs,
)

const displayName = computed(
  () =>
    ctx.value?.displayName ||
    sessionUser.value?.displayName ||
    sessionUser.value?.email ||
    'Signed in',
)
const currentWorkspaceName = computed(() => ctx.value?.workspace?.name ?? null)
const canCreate = can(kbCreate)
const allRoles = ['owner', 'admin', 'editor', 'contributor', 'viewer'] as const
const recordRuleRows = [
  { label: 'Update any article', roles: ['owner', 'admin'] },
  { label: 'Update own article', roles: ['owner', 'admin', 'editor', 'contributor'] },
]
const permissionMatrix = [
  ...knowledgeBasePermissionMatrix,
  ...articlePermissionMatrix,
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

async function handleCreateKB() {
  await createKB({ title: kbForm.title })
  kbForm.title = ''
}
</script>
