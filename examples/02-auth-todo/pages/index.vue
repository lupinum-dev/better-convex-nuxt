<template>
  <main class="page">
    <section class="panel">
      <p class="eyebrow">Example 02</p>
      <h1>Auth Todo</h1>
      <p class="lede">
        This version keeps the same todo domain, but now every list and mutation belongs to the
        signed-in user.
      </p>

      <ConvexAuthLoading>
        <p class="status">Checking the current session...</p>
      </ConvexAuthLoading>

      <ConvexUnauthenticated>
        <div class="auth-grid">
          <form class="card" @submit.prevent="handleSignUp">
            <h2>Create account</h2>
            <label class="field">
              <span>Name</span>
              <input v-model="signUpForm.name" class="input" type="text" required />
            </label>
            <label class="field">
              <span>Email</span>
              <input v-model="signUpForm.email" class="input" type="email" required />
            </label>
            <label class="field">
              <span>Password</span>
              <input
                v-model="signUpForm.password"
                class="input"
                type="password"
                minlength="8"
                required
              />
            </label>
            <button class="button" type="submit" :disabled="authAction.pending.value">
              {{ authAction.pending.value ? 'Creating...' : 'Sign up' }}
            </button>
          </form>

          <form class="card" @submit.prevent="handleSignIn">
            <h2>Sign in</h2>
            <label class="field">
              <span>Email</span>
              <input v-model="signInForm.email" class="input" type="email" required />
            </label>
            <label class="field">
              <span>Password</span>
              <input v-model="signInForm.password" class="input" type="password" required />
            </label>
            <button class="button muted" type="submit" :disabled="authAction.pending.value">
              {{ authAction.pending.value ? 'Signing in...' : 'Sign in' }}
            </button>
          </form>
        </div>

        <p v-if="authAction.error.value" class="error">
          {{ authAction.error.value.message }}
        </p>
      </ConvexUnauthenticated>

      <ConvexAuthenticated>
        <header class="toolbar">
          <div>
            <h2>{{ user?.name || user?.email || 'Signed in user' }}</h2>
            <p class="hint">
              The page waits until a matching row exists in the app's `users` table before it runs
              the authed todo query.
            </p>
          </div>
          <button class="ghost" type="button" @click="handleSignOut">
            Sign out
          </button>
        </header>

        <p v-if="ensuringUser || todosPending" class="status">Loading your personal todos...</p>
        <p v-if="todoError" class="error">{{ todoError }}</p>

        <form class="composer" @submit.prevent="handleCreateTodo">
          <label class="field">
            <span>New personal todo</span>
            <div class="composer-row">
              <input
                v-model="title"
                class="input"
                type="text"
                placeholder="Only your account should see this"
                required
              />
              <button class="button" type="submit" :disabled="createTodo.pending.value || !actorReady">
                {{ createTodo.pending.value ? 'Adding...' : 'Add' }}
              </button>
            </div>
          </label>
        </form>

        <ul v-if="todos?.length" class="list">
          <li v-for="todo in todos" :key="todo._id" class="item">
            <label class="checkbox-row">
              <input
                type="checkbox"
                :checked="todo.completed"
                @change="toggleTodo({ id: todo._id })"
              />
              <span :class="{ done: todo.completed }">{{ todo.title }}</span>
            </label>
            <button class="ghost" type="button" @click="removeTodo({ id: todo._id })">
              Delete
            </button>
          </li>
        </ul>
        <p v-else-if="actorReady" class="empty">No personal todos yet.</p>
      </ConvexAuthenticated>
    </section>
  </main>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * The page intentionally shows the whole auth story in one place:
 * signed out -> sign in/up -> actor ready -> user-scoped query and mutations.
 */
import { computed, reactive, ref, watch } from 'vue'

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
const actorReady = ref(false)
const ensuringUser = ref(false)

const ensureUserExists = useConvexMutation(api.auth.createUserIfNeeded)
const createTodo = useConvexMutation(api.todos.create)
const toggleTodo = useConvexMutation(api.todos.toggle)
const removeTodo = useConvexMutation(api.todos.remove)

// The authed query only runs once we know the local `users` row exists.
const todoArgs = computed(() => (isAuthenticated.value && actorReady.value ? {} : undefined))
const { data: todos, pending: todosPending, error: todosError } = await useConvexQuery(
  api.todos.list,
  todoArgs,
)

const todoError = computed(() =>
  todosError.value?.message
  || createTodo.error.value?.message
  || toggleTodo.error.value?.message
  || removeTodo.error.value?.message
  || '',
)

watch(
  isAuthenticated,
  async (value) => {
    if (!value) {
      actorReady.value = false
      return
    }

    ensuringUser.value = true
    try {
      await ensureUserExists({})
      actorReady.value = true
    } finally {
      ensuringUser.value = false
    }
  },
  { immediate: true },
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

<style scoped>
.page {
  min-height: 100vh;
  padding: 2rem;
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.18), transparent 26rem),
    linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%);
  color: #0f172a;
}

.panel {
  width: min(100%, 64rem);
  margin: 0 auto;
  padding: 2rem;
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
}

.eyebrow {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #0369a1;
}

h1,
h2 {
  margin: 0;
}

.lede,
.hint,
.status,
.empty {
  color: #475569;
}

.auth-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.card {
  display: grid;
  gap: 0.9rem;
  padding: 1.2rem;
  border-radius: 1.1rem;
  background: white;
  border: 1px solid #dbeafe;
}

.toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.5rem;
}

.field {
  display: grid;
  gap: 0.45rem;
}

.composer {
  margin: 1.5rem 0;
}

.composer-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
}

.input,
.button,
.ghost {
  border-radius: 0.9rem;
  font: inherit;
}

.input {
  min-width: 0;
  padding: 0.9rem 1rem;
  border: 1px solid #cbd5e1;
  background: white;
}

.button {
  padding: 0.9rem 1.2rem;
  border: none;
  background: #0369a1;
  color: white;
  font-weight: 700;
}

.button.muted {
  background: #334155;
}

.ghost {
  padding: 0.75rem 1rem;
  border: 1px solid #cbd5e1;
  background: white;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.85rem;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
  border-radius: 1rem;
  background: white;
  border: 1px solid #e2e8f0;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.done {
  color: #64748b;
  text-decoration: line-through;
}

.error {
  color: #b91c1c;
}

@media (max-width: 720px) {
  .auth-grid,
  .composer-row {
    grid-template-columns: 1fr;
  }

  .toolbar,
  .item {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
