<template>
  <main class="page">
    <section class="panel">
      <p class="eyebrow">Example 03</p>
      <h1>Team Todo</h1>
      <p class="lede">
        This is the full V2 story: auth, org scoping, declarative permissions, frontend
        permission guards, and MCP tools using the same backend functions.
      </p>

      <ConvexAuthLoading>
        <p class="status">Checking your session...</p>
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
            <h2>{{ displayName }}</h2>
            <p class="hint">
              Role: <strong>{{ role || 'loading...' }}</strong>
              <span v-if="orgId"> · Workspace ID: {{ orgId }}</span>
            </p>
          </div>
          <button class="ghost" type="button" @click="handleSignOut">
            Sign out
          </button>
        </header>

        <p v-if="ensureUser.pending.value" class="status">Preparing your application user...</p>

        <section v-if="isAuthenticated && !orgId" class="setup-grid">
          <form class="card" @submit.prevent="handleCreateWorkspace">
            <h3>Create workspace</h3>
            <p class="hint">
              The creator becomes the workspace owner. That keeps the example role model obvious.
            </p>
            <label class="field">
              <span>Name</span>
              <input v-model="createWorkspaceForm.name" class="input" type="text" required />
            </label>
            <label class="field">
              <span>Slug</span>
              <input v-model="createWorkspaceForm.slug" class="input" type="text" required />
            </label>
            <button class="button" type="submit" :disabled="createWorkspace.pending.value">
              {{ createWorkspace.pending.value ? 'Creating...' : 'Create workspace' }}
            </button>
          </form>

          <form class="card" @submit.prevent="handleJoinWorkspace">
            <h3>Join workspace</h3>
            <p class="hint">
              This demo keeps joining intentionally open so you can quickly test different roles.
            </p>
            <label class="field">
              <span>Workspace slug</span>
              <input v-model="joinWorkspaceForm.slug" class="input" type="text" required />
            </label>
            <label class="field">
              <span>Role</span>
              <select v-model="joinWorkspaceForm.role" class="input">
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
              </select>
            </label>
            <button class="button muted" type="submit" :disabled="joinWorkspace.pending.value">
              {{ joinWorkspace.pending.value ? 'Joining...' : 'Join workspace' }}
            </button>
          </form>
        </section>

        <section v-if="workspaceOptions?.length && !orgId" class="workspace-list">
          <h3>Existing workspaces</h3>
          <ul>
            <li v-for="workspace in workspaceOptions" :key="workspace._id">
              <strong>{{ workspace.name }}</strong>
              <span>({{ workspace.slug }})</span>
            </li>
          </ul>
        </section>

        <section v-if="orgId" class="todo-shell">
          <div class="todo-header">
            <div>
              <h3>Workspace todos</h3>
              <p class="hint">
                The list query is a `scopedQuery`, so it only returns rows from your current org.
              </p>
            </div>
            <p class="mcp-note">
              MCP demo auth header:
              <code>Bearer demo:{{ permissionContext?.email || user?.email || 'you@example.com' }}</code>
            </p>
          </div>

          <form class="composer" @submit.prevent="handleCreateTodo">
            <label class="field">
              <span>New team todo</span>
              <div class="composer-row">
                <input
                  v-model="title"
                  class="input"
                  type="text"
                  placeholder="Visible to everyone in your workspace"
                  required
                />
                <button
                  class="button"
                  type="submit"
                  :disabled="createTodo.pending.value || !canCreate"
                >
                  {{ createTodo.pending.value ? 'Adding...' : 'Add' }}
                </button>
              </div>
            </label>
          </form>

          <p v-if="!canCreate" class="hint">
            Your current role cannot create todos in this workspace.
          </p>

          <p v-if="todoError" class="error">{{ todoError }}</p>
          <p v-if="todosPending" class="status">Loading workspace todos...</p>

          <ul v-if="todos?.length" class="list">
            <li v-for="todo in todos" :key="todo._id" class="item">
              <div class="todo-main">
                <label class="checkbox-row">
                  <input
                    type="checkbox"
                    :checked="todo.completed"
                    :disabled="!canUpdate(todo)"
                    @change="handleToggle(todo._id, !todo.completed)"
                  />
                  <span :class="{ done: todo.completed }">{{ todo.title }}</span>
                </label>
                <small class="meta">owner: {{ todo.ownerId }}</small>
              </div>
              <button
                class="ghost"
                type="button"
                :disabled="!canDelete(todo)"
                @click="removeTodo({ id: todo._id })"
              >
                Delete
              </button>
            </li>
          </ul>
          <p v-else-if="orgId" class="empty">No team todos yet.</p>
        </section>
      </ConvexAuthenticated>
    </section>
  </main>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * This page intentionally puts the whole "full example" flow in one file so readers can
 * trace auth, onboarding, scoped queries, and frontend permission checks without hunting around.
 */
import { computed, reactive, ref, watch } from 'vue'

import { api } from '~/convex/_generated/api'
import type { Id } from '~/convex/_generated/dataModel'

const { client, isAuthenticated, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, role, orgId, user: permissionContext } = usePermissions()

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

const joinWorkspaceForm = reactive({
  slug: '',
  role: 'member' as 'admin' | 'member' | 'viewer',
})

const title = ref('')

const ensureUser = useConvexMutation(api.auth.createUserIfNeeded)
const createWorkspace = useConvexMutation(api.organizations.createWorkspace)
const joinWorkspace = useConvexMutation(api.organizations.joinWorkspace)
const createTodo = useConvexMutation(api.todos.create)
const updateTodo = useConvexMutation(api.todos.setCompleted)
const removeTodo = useConvexMutation(api.todos.remove)

const { data: workspaceOptions } = await useConvexQuery(api.organizations.listWorkspaces, {})

// The permission context query can run anonymously. It returns null until the user is signed in.
// The todo list query only runs once the user actually belongs to a workspace.
const todoArgs = computed(() => (orgId.value ? {} : undefined))
const { data: todos, pending: todosPending, error: todosError } = await useConvexQuery(
  api.todos.list,
  todoArgs,
)

const displayName = computed(
  () =>
    permissionContext.value?.displayName
    || permissionContext.value?.email
    || user.value?.name
    || user.value?.email
    || 'Signed in user',
)

const canCreate = computed(() => can('todo.create').value)

const todoError = computed(() =>
  todosError.value?.message
  || createTodo.error.value?.message
  || updateTodo.error.value?.message
  || removeTodo.error.value?.message
  || createWorkspace.error.value?.message
  || joinWorkspace.error.value?.message
  || '',
)

watch(
  isAuthenticated,
  async (value) => {
    if (!value) return
    await ensureUser({})
  },
  { immediate: true },
)

// `can()` returns a ComputedRef so components can stay reactive when the permission context changes.
function canUpdate(todo: Record<string, unknown>) {
  return can('todo.update', todo).value
}

function canDelete(todo: Record<string, unknown>) {
  return can('todo.delete', todo).value
}

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

<style scoped>
.page {
  min-height: 100vh;
  padding: 2rem;
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.18), transparent 24rem),
    radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.16), transparent 28rem),
    linear-gradient(180deg, #fffaf0 0%, #eff6ff 100%);
  color: #111827;
}

.panel {
  width: min(100%, 72rem);
  margin: 0 auto;
  padding: 2rem;
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(17, 24, 39, 0.08);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
}

.eyebrow {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #b45309;
}

h1,
h2,
h3 {
  margin: 0;
}

.lede,
.hint,
.status,
.empty,
.meta {
  color: #475569;
}

.auth-grid,
.setup-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.card,
.workspace-list,
.todo-shell {
  padding: 1.2rem;
  border-radius: 1.1rem;
  background: white;
  border: 1px solid #e2e8f0;
}

.card,
.workspace-list {
  display: grid;
  gap: 0.9rem;
}

.toolbar,
.todo-header {
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
  margin: 1.25rem 0;
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
  background: #b45309;
  color: white;
  font-weight: 700;
}

.button.muted {
  background: #0f766e;
}

.ghost {
  padding: 0.75rem 1rem;
  border: 1px solid #cbd5e1;
  background: white;
}

.workspace-list ul,
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.workspace-list ul {
  display: grid;
  gap: 0.5rem;
}

.list {
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
  background: #fffdf8;
  border: 1px solid #e5e7eb;
}

.todo-main {
  display: grid;
  gap: 0.3rem;
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

.mcp-note code {
  white-space: normal;
}

.error {
  color: #b91c1c;
}

@media (max-width: 820px) {
  .auth-grid,
  .setup-grid,
  .composer-row {
    grid-template-columns: 1fr;
  }

  .toolbar,
  .todo-header,
  .item {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
