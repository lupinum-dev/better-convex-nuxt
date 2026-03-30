<template>
  <main class="page">
    <h1>Example 09: Doc Sharing</h1>
    <p>
      The page demonstrates both access paths: normal workspace access and token-based link
      access. The backend keeps them explicit so they do not blur together.
    </p>

    <ConvexAuthLoading>
      <p>Checking your session...</p>
    </ConvexAuthLoading>

    <ConvexUnauthenticated>
      <form @submit.prevent="handleSignUp">
        <h2>Create account</h2>
        <input v-model="signUpForm.name" placeholder="Name" required />
        <input v-model="signUpForm.email" placeholder="Email" type="email" required />
        <input v-model="signUpForm.password" placeholder="Password" type="password" required />
        <button :disabled="authAction.pending.value">Sign up</button>
      </form>

      <form @submit.prevent="handleSignIn">
        <h2>Sign in</h2>
        <input v-model="signInForm.email" placeholder="Email" type="email" required />
        <input v-model="signInForm.password" placeholder="Password" type="password" required />
        <button :disabled="authAction.pending.value">Sign in</button>
      </form>
    </ConvexUnauthenticated>

    <ConvexAuthenticated>
      <header>
        <p>
          Signed in as <strong>{{ ctx?.displayName || user?.email }}</strong>
          <span v-if="role"> · role: {{ role }}</span>
        </p>
        <button @click="handleSignOut">Sign out</button>
      </header>

      <p v-if="ensureUserRow.pending.value">Preparing your application user...</p>

      <section v-if="!tenantId">
        <form @submit.prevent="handleCreateWorkspace">
          <h2>Create workspace</h2>
          <input v-model="createWorkspaceForm.name" placeholder="Workspace name" required />
          <input v-model="createWorkspaceForm.slug" placeholder="Slug" required />
          <button :disabled="createWorkspace.pending.value">Create workspace</button>
        </form>

        <form @submit.prevent="handleJoinWorkspace">
          <h2>Join workspace</h2>
          <input v-model="joinWorkspaceForm.slug" placeholder="Workspace slug" required />
          <select v-model="joinWorkspaceForm.role">
            <option value="admin">admin</option>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
          <button :disabled="joinWorkspace.pending.value">Join workspace</button>
        </form>
      </section>

      <section v-else>
        <button v-if="can('page.create')" @click="seedDemoPages({})">Seed demo pages</button>

        <ul v-if="pages?.length">
          <li v-for="page in pages" :key="page._id">
            <strong>{{ page.title }}</strong> · {{ page.visibility }}
            <button @click="openPage(page._id)">Open via workspace</button>
            <button @click="makeShareToken(page._id)">Create view token</button>
          </li>
        </ul>

        <p v-if="createdToken">Latest token: {{ createdToken }}</p>

        <form @submit.prevent="openSharedPage">
          <input v-model="shareView.pageId" placeholder="Page id" required />
          <input v-model="shareView.token" placeholder="Share token" required />
          <button>Open via token</button>
        </form>

        <pre v-if="openedPage">{{ openedPage }}</pre>
        <p v-if="pageError">{{ pageError }}</p>
      </section>
    </ConvexAuthenticated>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { api } from '~/convex/_generated/api'
import type { Id } from '~/convex/_generated/dataModel'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, ctx, role, tenantId } = usePermissions()

const signUpForm = reactive({ name: '', email: '', password: '' })
const signInForm = reactive({ email: '', password: '' })
const createWorkspaceForm = reactive({ name: '', slug: '' })
const joinWorkspaceForm = reactive({
  slug: '',
  role: 'member' as 'admin' | 'member' | 'viewer',
})
const shareView = reactive({
  pageId: '',
  token: '',
})
const createdToken = ref('')
const selectedPageArgs = ref<{ id: Id<'pages'>, shareToken?: string } | undefined>(undefined)

const ensureUserRow = useEnsureUserRow()
const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)
const seedDemoPages = useConvexMutation(api.pages.seedDemoPages)
const createShareToken = useConvexMutation(api.pages.createShareToken)
const pageArgs = computed(() => (tenantId.value ? {} : undefined))
const { data: pages, error: pagesError } = await useConvexQuery(api.pages.list, pageArgs)
const { data: openedPage, error: openedPageError } = await useConvexQuery(api.pages.viewPage, selectedPageArgs)

const pageError = computed(
  () =>
    pagesError.value?.message
    || openedPageError.value?.message
    || createShareToken.error.value?.message
    || '',
)

async function handleSignUp() {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signUp.email(signUpForm), { redirectTo: '/' })
}

async function handleSignIn() {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signIn.email(signInForm), { redirectTo: '/' })
}

async function handleSignOut() {
  await signOut()
}

async function handleCreateWorkspace() {
  await createWorkspace(createWorkspaceForm)
}

async function handleJoinWorkspace() {
  await joinWorkspace(joinWorkspaceForm)
}

function openPage(id: Id<'pages'>) {
  selectedPageArgs.value = { id }
}

async function makeShareToken(id: Id<'pages'>) {
  createdToken.value = await createShareToken({
    pageId: id,
    level: 'view',
  })
}

function openSharedPage() {
  selectedPageArgs.value = {
    id: shareView.pageId as Id<'pages'>,
    shareToken: shareView.token,
  }
}
</script>

<style scoped>
.page {
  max-width: 60rem;
  margin: 0 auto;
  padding: 2rem;
}

form,
section,
header,
ul,
pre {
  margin-bottom: 1rem;
}

input,
select,
button {
  display: block;
  width: 100%;
  max-width: 32rem;
  margin: 0.25rem 0;
  padding: 0.5rem;
}
</style>
