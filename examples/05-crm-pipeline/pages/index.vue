<template>
  <main class="page">
    <h1>Example 05: CRM Pipeline</h1>
    <p>
      This CRM stays intentionally small. The point is to show that "can read contacts" is not the
      same as "can read all contacts" and that some fields must still be redacted afterwards.
    </p>

    <ConvexAuthLoading>
      <p>Checking your session...</p>
    </ConvexAuthLoading>

    <ConvexUnauthenticated>
      <section>
        <h2>Create account</h2>
        <form @submit.prevent="handleSignUp">
          <input v-model="signUpForm.name" placeholder="Name" required />
          <input v-model="signUpForm.email" placeholder="Email" type="email" required />
          <input v-model="signUpForm.password" placeholder="Password" type="password" required />
          <button :disabled="authAction.pending.value">Sign up</button>
        </form>
      </section>

      <section>
        <h2>Sign in</h2>
        <form @submit.prevent="handleSignIn">
          <input v-model="signInForm.email" placeholder="Email" type="email" required />
          <input v-model="signInForm.password" placeholder="Password" type="password" required />
          <button :disabled="authAction.pending.value">Sign in</button>
        </form>
      </section>

      <p v-if="authAction.error.value">{{ authAction.error.value.message }}</p>
    </ConvexUnauthenticated>

    <ConvexAuthenticated>
      <header>
        <p>
          Signed in as <strong>{{ ctx?.displayName || user?.email }}</strong>
          <span v-if="role"> · role: {{ role }}</span>
          <span v-if="tenantId"> · workspace: {{ tenantId }}</span>
        </p>
        <button @click="handleSignOut">Sign out</button>
      </header>

      <p v-if="ensureUserRow.pending.value">Preparing your application user...</p>

      <section v-if="!tenantId">
        <h2>Create workspace</h2>
        <form @submit.prevent="handleCreateWorkspace">
          <input v-model="createWorkspaceForm.name" placeholder="Workspace name" required />
          <input v-model="createWorkspaceForm.slug" placeholder="Slug" required />
          <button :disabled="createWorkspace.pending.value">Create workspace</button>
        </form>

        <h2>Join workspace</h2>
        <form @submit.prevent="handleJoinWorkspace">
          <input v-model="joinWorkspaceForm.slug" placeholder="Workspace slug" required />
          <select v-model="joinWorkspaceForm.role">
            <option value="admin">admin</option>
            <option value="manager">manager</option>
            <option value="rep">rep</option>
          </select>
          <input
            v-model="joinWorkspaceForm.managerEmail"
            placeholder="Manager email (for reps)"
          />
          <button :disabled="joinWorkspace.pending.value">Join workspace</button>
        </form>

        <ul v-if="workspaceOptions?.length">
          <li v-for="workspace in workspaceOptions" :key="workspace._id">
            {{ workspace.name }} ({{ workspace.slug }})
          </li>
        </ul>
      </section>

      <section v-else>
        <h2>Visible contacts</h2>
        <p>Try the same workspace with different roles to compare visible rows and fields.</p>

        <form @submit.prevent="handleCreateContact">
          <input v-model="contactForm.name" placeholder="Contact name" required />
          <input v-model="contactForm.company" placeholder="Company" required />
          <input v-model="contactForm.phone" placeholder="Phone" />
          <input v-model="contactForm.personalEmail" placeholder="Personal email" />
          <input
            v-model.number="contactForm.estimatedRevenue"
            placeholder="Estimated revenue"
            type="number"
          />
          <textarea v-model="contactForm.internalNotes" placeholder="Internal notes" />
          <button :disabled="createContact.pending.value || !canCreateContact">Create contact</button>
        </form>

        <p v-if="contactError">{{ contactError }}</p>

        <ul v-if="contacts?.length">
          <li v-for="contact in contacts" :key="contact._id">
            <strong>{{ contact.name }}</strong> · {{ contact.company }} · owner:
            {{ contact.ownerId }}
            <div v-if="contact.phone">phone: {{ contact.phone }}</div>
            <div v-if="contact.personalEmail">email: {{ contact.personalEmail }}</div>
            <div v-if="'estimatedRevenue' in contact">revenue: {{ contact.estimatedRevenue }}</div>
            <div v-if="'internalNotes' in contact">notes: {{ contact.internalNotes }}</div>
          </li>
        </ul>
        <p v-else>No contacts visible yet.</p>
      </section>
    </ConvexAuthenticated>
  </main>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * A single page is enough for this example. Visibility and redaction are backend decisions, and
 * the UI just reflects them.
 */
import { computed, reactive } from 'vue'

import { api } from '~/convex/_generated/api'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, ctx, role, tenantId } = usePermissions()

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
  role: 'rep' as 'admin' | 'manager' | 'rep',
  managerEmail: '',
})

const contactForm = reactive({
  name: '',
  company: '',
  phone: '',
  personalEmail: '',
  estimatedRevenue: undefined as number | undefined,
  internalNotes: '',
})

const ensureUserRow = useEnsureConvexUser(api.auth.createUserIfNeeded)
const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)
const createContact = useConvexMutation(api.contacts.create)

const { data: workspaceOptions } = await useConvexQuery(api.workspaces.listWorkspaces, {})
const contactArgs = computed(() => (tenantId.value ? {} : undefined))
const { data: contacts, error: contactsError } = await useConvexQuery(api.contacts.list, contactArgs)

const canCreateContact = can('contact.create')
const contactError = computed(
  () =>
    createContact.error.value?.message
    || contactsError.value?.message
    || createWorkspace.error.value?.message
    || joinWorkspace.error.value?.message
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

async function handleCreateContact() {
  await createContact({
    ...contactForm,
    phone: contactForm.phone || undefined,
    personalEmail: contactForm.personalEmail || undefined,
    internalNotes: contactForm.internalNotes || undefined,
  })
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
ul {
  margin-bottom: 1rem;
}

input,
select,
textarea,
button {
  display: block;
  width: 100%;
  max-width: 32rem;
  margin: 0.25rem 0;
  padding: 0.5rem;
}
</style>
