<script setup lang="ts">
import { createTodo } from '~~/shared/features/todos/contract'

import { api } from '#trellis/api'
import { todoCreate } from '#trellis/permissions'

const { isAuthenticated, isPending, signOut, sessionUser } = useConvexAuth()
const { signIn, pending: signInPending, error: signInError } = useBetterAuthSignIn()
const { signUp, pending: signUpPending, error: signUpError } = useBetterAuthSignUp()
const { can, ready, workspaceId, role } = useAccess()

const email = ref('owner@example.com')
const password = ref('password1234')
const workspaceName = ref('My workspace')
const title = ref('')

const todoArgs = computed(() => (ready.value ? {} : undefined))
const { data: todos } = await useConvexQuery(api.features.todos.domain.list, todoArgs)

const createWorkspace = useConvexMutation(api.features.workspaces.domain.createWorkspaceMutation)
const createTodoMutation = useConvexMutation(api.features.todos.domain.create)
const canCreate = can(todoCreate)

async function handleSignIn() {
  await signIn({
    email: email.value,
    password: password.value,
  })
}

async function handleSignUp() {
  await signUp({
    email: email.value,
    password: password.value,
    name: email.value.split('@')[0] ?? email.value,
  })
}

async function handleCreateWorkspace() {
  await createWorkspace({ name: workspaceName.value.trim() || 'My workspace' })
}

async function handleCreateTodo() {
  const parsed = createTodo.zod.safeParse({ title: title.value })
  if (!parsed.success) return

  await createTodoMutation(parsed.data)
  title.value = ''
}
</script>

<template>
  <main style="max-width: 760px; margin: 0 auto; padding: 40px 16px">
    <h1>Workspace Starter</h1>
    <p>Workspace starter with tenant-aware backend handlers.</p>

    <div v-if="isPending">Loading auth...</div>

    <div v-else-if="!isAuthenticated" style="display: grid; gap: 12px; max-width: 320px">
      <input v-model="email" type="email" placeholder="Email" />
      <input v-model="password" type="password" placeholder="Password" />
      <div style="display: flex; gap: 8px">
        <button :disabled="signInPending" @click="handleSignIn">Sign in</button>
        <button :disabled="signUpPending" @click="handleSignUp">Sign up</button>
      </div>
      <p v-if="signInError">{{ signInError.message }}</p>
      <p v-if="signUpError">{{ signUpError.message }}</p>
    </div>

    <div v-else-if="!ready" style="display: grid; gap: 12px; max-width: 320px">
      <p>
        Signed in as {{ sessionUser?.email ?? sessionUser?.displayName ?? 'user' }}. Create your
        first workspace.
      </p>
      <input v-model="workspaceName" type="text" placeholder="Workspace name" />
      <button :disabled="createWorkspace.pending.value" @click="handleCreateWorkspace">
        Create workspace
      </button>
    </div>

    <div v-else style="display: grid; gap: 16px">
      <p>Workspace: {{ workspaceId }} | Role: {{ role }}</p>
      <div style="display: flex; gap: 8px">
        <input v-model="title" type="text" placeholder="Add a workspace todo" />
        <button
          :disabled="createTodoMutation.pending.value || !canCreate"
          @click="handleCreateTodo"
        >
          Add
        </button>
        <button @click="signOut()">Sign out</button>
      </div>

      <ul style="display: grid; gap: 8px; padding-left: 20px">
        <li v-for="todo in todos ?? []" :key="todo._id">
          {{ todo.title }}
        </li>
      </ul>
    </div>
  </main>
</template>
