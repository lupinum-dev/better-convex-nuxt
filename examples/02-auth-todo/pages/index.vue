<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-green-50 to-white dark:from-green-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-4xl">
      <template #header>
        <p class="text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">
          Example 02
        </p>
        <h1 class="text-3xl font-bold mt-1">Auth Todo</h1>
        <p class="text-sm text-muted mt-2">
          This version keeps the same todo domain, but now every list and mutation belongs to the
          signed-in user.
        </p>
        <p class="text-sm text-muted mt-2">
          Auth may already be resolved during SSR. After sign-in, the module automatically
          bootstraps the app-level user row so the personal list can settle without page-level auth
          glue code.
        </p>
      </template>

      <div class="space-y-4">
        <div v-if="isPending" class="space-y-3">
          <p class="text-sm text-muted">Checking the current session...</p>
          <USkeleton class="h-24 w-full rounded-xl" />
        </div>

        <div v-else-if="!isAuthenticated" class="grid gap-4 md:grid-cols-2">
          <UCard>
            <UAuthForm
              :schema="signUpSchema"
              title="Create account"
              description="Create a personal account so your todos stay scoped to you."
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
              description="Use an existing account to load your personal todo list."
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

        <div v-else class="flex flex-col gap-4">
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 class="text-xl font-semibold">
                {{ user?.name || user?.email || 'Signed in user' }}
              </h2>
              <p class="text-sm text-muted mt-1">
                SSR can already know who you are, but app actor readiness is separate. The todo
                query starts only after the client ensures a matching row exists in the app's
                <code>users</code> table.
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
            title="Todo error"
            :description="todoError"
          />

          <div v-if="!actorReady || todosPending" class="space-y-3">
            <p class="text-sm text-muted">
              Preparing your app user, then subscribing to your personal todo list...
            </p>
            <USkeleton v-for="n in 3" :key="n" class="h-12 w-full rounded-xl" />
          </div>

          <div v-else class="space-y-4">
            <form class="flex flex-col gap-3 md:flex-row" @submit.prevent="handleCreateTodo">
              <UInput
                v-model="title"
                placeholder="Only your account should see this"
                class="flex-1"
                required
                :disabled="createTodo.pending.value || !actorReady"
              />
              <UButton
                type="submit"
                :loading="createTodo.pending.value"
                :disabled="!actorReady"
                leading-icon="i-lucide-plus"
              >
                Add
              </UButton>
            </form>

            <ul v-if="todos?.length" class="space-y-2">
              <li
                v-for="todo in todos"
                :key="todo._id"
                class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-default bg-elevated"
              >
                <UCheckbox
                  :model-value="todo.completed"
                  :label="todo.title"
                  :ui="{ label: todo.completed ? 'line-through text-muted' : '' }"
                  @update:model-value="toggleTodo({ id: todo._id })"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  aria-label="Delete todo"
                  @click="removeTodo({ id: todo._id })"
                />
              </li>
            </ul>

            <p v-else-if="actorReady" class="text-muted text-sm text-center py-8">
              No personal todos yet.
            </p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { computed, ref, watch } from 'vue'
/**
 * Why this file exists:
 * The page intentionally shows the whole auth story in one place:
 * signed out -> sign in/up -> actor ready -> user-scoped query and mutations.
 */
import * as z from 'zod'

import { api } from '~/convex/_generated/api'

const { client, isAuthenticated, isPending, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()

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

const title = ref('')
const createTodo = useConvexMutation(api.todos.create)
const toggleTodo = useConvexMutation(api.todos.toggle)
const removeTodo = useConvexMutation(api.todos.remove)

// The auth bootstrap is module-managed, so private data can subscribe once auth is active.
const actorReady = computed(() => isAuthenticated.value)
const todoArgs = computed(() => (isAuthenticated.value && actorReady.value ? {} : undefined))
const {
  data: todos,
  pending: todosPending,
  error: todosError,
} = await useConvexQuery(api.todos.list, todoArgs)

const todoError = computed(
  () =>
    todosError.value?.message ||
    createTodo.error.value?.message ||
    toggleTodo.error.value?.message ||
    removeTodo.error.value?.message ||
    '',
)

const debugPhase = computed(() => {
  if (isPending.value) return 'auth:pending'
  if (authAction.pending.value) return 'auth-action:pending'
  if (!isAuthenticated.value) return 'auth:anonymous'
  if (todosPending.value) return 'todos:subscribing'
  return 'todos:ready'
})

if (import.meta.dev) {
  watch(
    [debugPhase, () => user.value?.id ?? null, () => todos.value?.length ?? 0, todoError],
    ([phase, userId, todoCount, error], previous) => {
      const [previousPhase, previousUserId, previousTodoCount, previousError] = previous ?? []
      if (
        phase === previousPhase &&
        userId === previousUserId &&
        todoCount === previousTodoCount &&
        error === previousError
      ) {
        return
      }

      console.debug('[example-02] auth/todo transition', {
        phase,
        userId,
        todoCount,
        error: error || null,
      })
    },
    { immediate: true },
  )
}

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

async function handleCreateTodo() {
  await createTodo({
    title: title.value,
  })

  title.value = ''
}
</script>
