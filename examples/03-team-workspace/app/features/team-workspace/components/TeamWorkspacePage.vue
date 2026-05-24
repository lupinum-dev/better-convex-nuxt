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
          The canonical protected app: auth, tenant scoping, app-owned permissions, permission
          context, and one small server-boundary proof.
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
                description="Start with a user account, then create a workspace."
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
                  <span v-if="workspaceId"> · Workspace ID: {{ workspaceId }}</span>
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

            <template v-if="ready && !workspaceId">
              <UCard>
                <template #header>
                  <h3 class="text-lg font-semibold">Create workspace</h3>
                  <p class="text-sm text-muted mt-1">
                    The creator becomes the workspace owner. Invite-based collaboration is the next
                    step; this example no longer ships open self-join onboarding.
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
            </template>

            <template v-if="workspaceId">
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
                  </div>
                </template>

                <div class="space-y-4">
                  <form class="flex flex-col gap-3 md:flex-row" @submit.prevent="handleCreateTodo">
                    <UInput
                      v-model="title"
                      placeholder="Visible to everyone in your workspace"
                      class="flex-1"
                      required
                      :disabled="createTodoMutation.pending.value || !canCreate"
                    />
                    <UButton
                      type="submit"
                      :loading="createTodoMutation.pending.value"
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
import * as z from 'zod'
import type { Id } from '~~/convex/_generated/dataModel'
import { createTodo } from '~~/shared/features/todos/contract'

import { api } from '#trellis/api'
import { todoCreate, todoPermissionMatrix } from '#trellis/permissions'

const { sessionUser, signOut } = useConvexAuth()
const client = useBetterAuthClient()
const authAction = useBetterAuthActions()
const { can, ready, role, workspaceId, ctx } = useAccess()

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

const title = ref('')

const createWorkspace = useConvexMutation(api.features.workspaces.domain.createWorkspaceMutation)
const createTodoMutation = useConvexMutation(api.features.todos.domain.create)
const updateTodo = useConvexMutation(api.features.todos.domain.setCompleted)
const removeTodo = useConvexMutation(api.features.todos.domain.remove)

const todoArgs = computed(() => (workspaceId.value ? {} : undefined))
const {
  data: todos,
  pending: todosPending,
  error: todosError,
} = await useConvexQuery(api.features.todos.domain.list, todoArgs)

const displayName = computed(
  () =>
    ctx.value?.displayName ||
    ctx.value?.email ||
    sessionUser.value?.displayName ||
    sessionUser.value?.email ||
    'Signed in user',
)

const canCreate = can(todoCreate)
const allRoles = ['owner', 'admin', 'member', 'viewer']
const recordRuleRows = [
  { label: 'Update own todo', roles: ['owner', 'admin', 'member'] },
  { label: 'Delete own todo', roles: ['owner', 'admin', 'member'] },
]
const permissionMatrix = [...todoPermissionMatrix, ...recordRuleRows]

const todoError = computed(
  () =>
    todosError.value?.message ||
    createTodoMutation.error.value?.message ||
    updateTodo.error.value?.message ||
    removeTodo.error.value?.message ||
    createWorkspace.error.value?.message ||
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

async function handleCreateTodo() {
  const parsed = createTodo.zod.safeParse({ title: title.value })
  if (!parsed.success) return

  await createTodoMutation(parsed.data)
  title.value = ''
}

async function handleToggle(id: Id<'todos'>, completed: boolean) {
  await updateTodo({
    id,
    completed,
  })
}
</script>
