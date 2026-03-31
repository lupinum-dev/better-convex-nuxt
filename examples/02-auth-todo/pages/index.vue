<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-green-50 to-white dark:from-green-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-4xl">
      <template #header>
        <p
          class="text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400"
        >
          Example 02
        </p>
        <h1 class="text-3xl font-bold mt-1">Auth Todo</h1>
        <p class="text-sm text-muted mt-2">
          This version keeps the same todo domain, but now every list and mutation belongs to the
          signed-in user.
        </p>
      </template>

      <div class="space-y-4">
        <ConvexAuthLoading>
          <div class="space-y-3">
            <p class="text-sm text-muted">Checking the current session...</p>
            <USkeleton class="h-24 w-full rounded-xl" />
          </div>
        </ConvexAuthLoading>

        <ConvexUnauthenticated>
          <UAlert
            v-if="authAction.error.value"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Authentication error"
            :description="authAction.error.value.message"
          />

          <div class="grid gap-4 md:grid-cols-2">
            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">Create account</h2>
                <p class="text-sm text-muted mt-1">
                  Create a personal account so your todos stay scoped to you.
                </p>
              </template>

              <form class="space-y-4" @submit.prevent="handleSignUp">
                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Name</label>
                  <UInput v-model="signUpForm.name" type="text" required />
                </div>

                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Email</label>
                  <UInput v-model="signUpForm.email" type="email" required />
                </div>

                <div class="space-y-1">
                  <label class="text-sm font-medium text-highlighted">Password</label>
                  <UInput
                    v-model="signUpForm.password"
                    type="password"
                    minlength="8"
                    required
                  />
                </div>

                <UButton type="submit" block :loading="authAction.pending.value">
                  {{ authAction.pending.value ? 'Creating...' : 'Sign up' }}
                </UButton>
              </form>
            </UCard>

            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">Sign in</h2>
                <p class="text-sm text-muted mt-1">
                  Use an existing account to load your personal todo list.
                </p>
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
                  {{ authAction.pending.value ? 'Signing in...' : 'Sign in' }}
                </UButton>
              </form>
            </UCard>
          </div>
        </ConvexUnauthenticated>

        <ConvexAuthenticated>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 class="text-xl font-semibold">
                  {{ user?.name || user?.email || 'Signed in user' }}
                </h2>
                <p class="text-sm text-muted mt-1">
                  The page waits until a matching row exists in the app's `users` table before it
                  runs the authed todo query.
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

            <div v-if="ensureUserRow.pending.value || todosPending" class="space-y-3">
              <p class="text-sm text-muted">Loading your personal todos...</p>
              <USkeleton v-for="n in 3" :key="n" class="h-12 w-full rounded-xl" />
            </div>

            <template v-else>
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
 * The page intentionally shows the whole auth story in one place:
 * signed out -> sign in/up -> actor ready -> user-scoped query and mutations.
 */
import { computed, reactive, ref } from 'vue'

import { api } from '~/convex/_generated/api'

const { client, isAuthenticated, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()

const signUpForm = reactive({
  name: '',
  email: '',
  password: '',
})

const signInForm = reactive({
  email: '',
  password: '',
})

const title = ref('')
const ensureUserRow = useEnsureConvexUser(api.auth.createUserIfNeeded)
const createTodo = useConvexMutation(api.todos.create)
const toggleTodo = useConvexMutation(api.todos.toggle)
const removeTodo = useConvexMutation(api.todos.remove)

// The authed query only runs once we know the local `users` row exists.
const actorReady = computed(() => ensureUserRow.ready.value)
const todoArgs = computed(() => (isAuthenticated.value && actorReady.value ? {} : undefined))
const { data: todos, pending: todosPending, error: todosError } = await useConvexQuery(
  api.todos.list,
  todoArgs,
)

const todoError = computed(() =>
  ensureUserRow.error.value?.message
  || todosError.value?.message
  || createTodo.error.value?.message
  || toggleTodo.error.value?.message
  || removeTodo.error.value?.message
  || '',
)

async function handleSignUp() {
  if (!client) throw new Error('Auth client unavailable.')

  await authAction.execute(
    () =>
      client.signUp.email({
        name: signUpForm.name,
        email: signUpForm.email,
        password: signUpForm.password,
      }),
    { redirectTo: '/' },
  )
}

async function handleSignIn() {
  if (!client) throw new Error('Auth client unavailable.')

  await authAction.execute(
    () =>
      client.signIn.email({
        email: signInForm.email,
        password: signInForm.password,
      }),
    { redirectTo: '/' },
  )
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
