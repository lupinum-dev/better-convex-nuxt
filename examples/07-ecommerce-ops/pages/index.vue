<!--
Why this file exists:
This page is intentionally simple because the interesting part is shared auth and refund state, not UI depth.
-->
<template>
  <main class="page">
    <h1>Example 07: E-Commerce Ops</h1>
    <p>
      This example keeps the UI simple because the hard part is not CRUD. It is keeping human and
      webhook bot users on the same business-state path.
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

      <p v-if="false">Preparing your application user...</p>

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
            <option value="support">support</option>
            <option value="viewer">viewer</option>
          </select>
          <button :disabled="joinWorkspace.pending.value">Join workspace</button>
        </form>
      </section>

      <section v-else>
        <button v-if="canRefund" @click="seedDemoOrders({})">Seed demo orders</button>

        <ul v-if="orders?.length">
          <li v-for="order in orders" :key="order._id">
            <strong>{{ order.orderNumber }}</strong> · {{ order.status }} ·
            {{ (order.amountCents / 100).toFixed(2) }}
            <button
              :disabled="!canRefund || order.status === 'refunded'"
              @click="refundOrder({ orderId: order._id, reason: 'Customer requested refund' })"
            >
              Refund
            </button>
          </li>
        </ul>

        <p v-if="orderError">{{ orderError }}</p>
      </section>
    </ConvexAuthenticated>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'

import { api } from '~/convex/_generated/api'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, ctx, role, tenantId } = usePermissions()
const canRefund = can('order.refund')

const signUpForm = reactive({ name: '', email: '', password: '' })
const signInForm = reactive({ email: '', password: '' })
const createWorkspaceForm = reactive({ name: '', slug: '' })
const joinWorkspaceForm = reactive({
  slug: '',
  role: 'support' as 'admin' | 'support' | 'viewer',
})

const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)
const seedDemoOrders = useConvexMutation(api.orders.seedDemoOrders)
const refundOrder = useConvexMutation(api.orders.processRefund)
const orderArgs = computed(() => (tenantId.value ? {} : undefined))
const { data: orders, error: ordersError } = await useConvexQuery(api.orders.list, orderArgs)

const orderError = computed(
  () =>
    ordersError.value?.message
    || refundOrder.error.value?.message
    || seedDemoOrders.error.value?.message
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
button {
  display: block;
  width: 100%;
  max-width: 32rem;
  margin: 0.25rem 0;
  padding: 0.5rem;
}
</style>
