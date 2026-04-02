<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-green-50 to-white dark:from-green-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-5xl">
      <template #header>
        <p class="text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">
          Example 03
        </p>
        <h1 class="text-3xl font-bold mt-1">Team Workspace</h1>
        <p class="text-sm text-muted mt-2">
          The full team app story: auth, tenant scoping, app-owned permissions, frontend permission
          guards, MCP tools, webhook idempotency, and trusted caller verification.
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
              <UAuthForm
                :schema="signUpSchema"
                title="Create account"
                description="Start with a user account, then create or join a workspace."
                icon="i-lucide-user-plus"
                :fields="signUpFields"
                :submit="{ label: 'Sign up', block: true }"
                :loading="authAction.pending.value"
                @submit="handleSignUp"
              >
                <template #validation>
                  <UAlert
                    v-if="authAction.error.value"
                    color="error"
                    variant="soft"
                    icon="i-lucide-circle-alert"
                    title="Authentication error"
                    :description="authAction.error.value.message"
                  />
                </template>
              </UAuthForm>
            </UCard>

            <UCard>
              <UAuthForm
                :schema="signInSchema"
                title="Sign in"
                description="Load your workspace context and permission-aware team todos."
                icon="i-lucide-log-in"
                :fields="signInFields"
                :submit="{ label: 'Sign in', block: true, color: 'neutral', variant: 'soft' }"
                :loading="authAction.pending.value"
                @submit="handleSignIn"
              >
                <template #validation>
                  <UAlert
                    v-if="authAction.error.value"
                    color="error"
                    variant="soft"
                    icon="i-lucide-circle-alert"
                    title="Authentication error"
                    :description="authAction.error.value.message"
                  />
                </template>
              </UAuthForm>
            </UCard>
          </div>
        </ConvexUnauthenticated>

        <ConvexAuthenticated>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 class="text-xl font-semibold">{{ displayName }}</h2>
                <p class="text-sm text-muted mt-1">
                  Role:
                  <span class="font-semibold text-highlighted">{{ role || 'loading...' }}</span>
                  <span v-if="tenantId"> · Workspace ID: {{ tenantId }}</span>
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

            <UAlert
              v-if="todoError"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              title="Example error"
              :description="todoError"
            />

            <template v-if="ready && !tenantId">
              <div class="grid gap-4 md:grid-cols-2">
                <UCard>
                  <template #header>
                    <h3 class="text-lg font-semibold">Create workspace</h3>
                    <p class="text-sm text-muted mt-1">
                      The creator becomes the workspace owner. That keeps the example role model
                      obvious.
                    </p>
                  </template>

                  <form class="space-y-4" @submit.prevent="handleCreateWorkspace">
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted">Name</label>
                      <UInput v-model="createWorkspaceForm.name" type="text" required />
                    </div>

                    <div class="space-y-1">
                      <label class="text-sm font-medium text-highlighted">Slug</label>
                      <UInput v-model="createWorkspaceForm.slug" type="text" required />
                    </div>

                    <UButton type="submit" block :loading="createWorkspace.pending.value">
                      {{ createWorkspace.pending.value ? 'Creating...' : 'Create workspace' }}
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
                      <UInput v-model="joinWorkspaceForm.slug" type="text" required />
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
                      {{ joinWorkspace.pending.value ? 'Joining...' : 'Join workspace' }}
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
                      <h3 class="text-lg font-semibold">Workspace todos</h3>
                      <p class="text-sm text-muted mt-1">
                        The list query is a raw Convex query, and the handler applies the tenant
                        boundary explicitly.
                      </p>
                    </div>
                    <p class="text-sm text-muted break-words">
                      MCP demo auth header:
                      <code class="font-mono text-xs text-highlighted">
                        Bearer demo:{{ ctx?.email || user?.email || 'you@example.com' }}
                      </code>
                    </p>
                  </div>
                </template>

                <div class="space-y-4">
                  <form class="flex flex-col gap-3 md:flex-row" @submit.prevent="handleCreateTodo">
                    <UInput
                      v-model="title"
                      placeholder="Visible to everyone in your workspace"
                      class="flex-1"
                      required
                      :disabled="createTodo.pending.value || !canCreate"
                    />
                    <UButton
                      type="submit"
                      :loading="createTodo.pending.value"
                      :disabled="!canCreate"
                      leading-icon="i-lucide-plus"
                    >
                      Add
                    </UButton>
                  </form>

                  <UAlert
                    v-if="!canCreate"
                    color="warning"
                    variant="soft"
                    icon="i-lucide-shield-alert"
                    title="Create permission required"
                    description="Your current role cannot create todos in this workspace."
                  />

                  <div v-if="todosPending" class="space-y-3">
                    <p class="text-sm text-muted">Loading workspace todos...</p>
                    <USkeleton v-for="n in 3" :key="n" class="h-14 w-full rounded-xl" />
                  </div>

                  <ul v-else-if="todos?.length" class="space-y-2">
                    <li
                      v-for="todo in todos"
                      :key="todo._id"
                      class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-default bg-elevated"
                    >
                      <div class="min-w-0 flex-1 space-y-1">
                        <div class="flex items-center gap-2">
                          <UCheckbox
                            :model-value="todo.completed"
                            :label="todo.title"
                            :disabled="!todo._can.update"
                            :ui="{ label: todo.completed ? 'line-through text-muted' : '' }"
                            @update:model-value="handleToggle(todo._id, !todo.completed)"
                          />
                          <UBadge
                            v-if="todo.source === 'webhook'"
                            color="info"
                            variant="subtle"
                            size="xs"
                          >
                            webhook
                          </UBadge>
                        </div>
                        <p class="text-xs text-muted">owner: {{ todo.ownerId }}</p>
                      </div>

                      <UButton
                        icon="i-lucide-trash-2"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        square
                        aria-label="Delete todo"
                        :disabled="!todo._can.delete"
                        @click="removeTodo({ id: todo._id })"
                      />
                    </li>
                  </ul>

                  <p v-else class="text-muted text-sm text-center py-8">No team todos yet.</p>
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
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { computed, reactive, ref } from 'vue'
/**
 * Why this file exists:
 * This page intentionally puts the whole "full example" flow in one file so readers can
 * trace auth, onboarding, scoped queries, and frontend permission checks without hunting around.
 */
import * as z from 'zod'

import { api } from '#trellis/api'
import type { Id } from '~/convex/_generated/dataModel'
import { teamWorkspacePermissionKeys } from '~/shared/permissions'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, ready, role, tenantId, ctx } = usePermissions()

const signUpFields: AuthFormField[] = [
  {
    name: 'name',
    type: 'text',
    label: 'Name',
    placeholder: 'Enter your name',
    required: true,
  },
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'Enter your email',
    required: true,
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'Create a password',
    required: true,
  },
]

const signInFields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'Enter your email',
    required: true,
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'Enter your password',
    required: true,
  },
]

const signUpSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
})

const signInSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})

type SignUpSchema = z.output<typeof signUpSchema>
type SignInSchema = z.output<typeof signInSchema>

const createWorkspaceForm = reactive({
  name: '',
  slug: '',
})

const joinWorkspaceForm = reactive({
  slug: '',
  role: 'member' as 'admin' | 'member' | 'viewer',
})

const title = ref('')

const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)
const createTodo = useConvexMutation(api.todos.create)
const updateTodo = useConvexMutation(api.todos.setCompleted)
const removeTodo = useConvexMutation(api.todos.remove)

const { data: workspaceOptions } = await useConvexQuery(api.workspaces.listWorkspaces, {})

// The permission context query can run anonymously. It returns null until the user is signed in.
// The todo list query only runs once the user actually belongs to a workspace.
const todoArgs = computed(() => (tenantId.value ? {} : undefined))
const {
  data: todos,
  pending: todosPending,
  error: todosError,
} = await useConvexQuery(api.todos.list, todoArgs)

const displayName = computed(
  () =>
    ctx.value?.displayName ||
    ctx.value?.email ||
    user.value?.name ||
    user.value?.email ||
    'Signed in user',
)

const canCreate = can(teamWorkspacePermissionKeys.todoCreate)
const roleOptions = ['admin', 'member', 'viewer'] as const

const todoError = computed(
  () =>
    todosError.value?.message ||
    createTodo.error.value?.message ||
    updateTodo.error.value?.message ||
    removeTodo.error.value?.message ||
    createWorkspace.error.value?.message ||
    joinWorkspace.error.value?.message ||
    '',
)

async function handleSignUp(payload: FormSubmitEvent<SignUpSchema>) {
  if (!client) throw new Error('Auth client unavailable.')

  await authAction.execute(() => client.signUp.email(payload.data), { redirectTo: '/' })
}

async function handleSignIn(payload: FormSubmitEvent<SignInSchema>) {
  if (!client) throw new Error('Auth client unavailable.')

  await authAction.execute(() => client.signIn.email(payload.data), { redirectTo: '/' })
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

async function handleCreateTodo() {
  await createTodo({
    title: title.value,
  })

  title.value = ''
}

async function handleToggle(id: Id<'todos'>, completed: boolean) {
  await updateTodo({
    id,
    completed,
  })
}
</script>
