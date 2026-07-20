<script setup lang="ts">
import { api } from '#convex/api'

const { isAuthenticated, isPending, signOut } = useConvexAuth()
const currentUser = useConvexUser(
  api.users.getCurrent,
  {},
  {
    seedFromSession: false,
    source: 'projection',
  },
)
</script>

<template>
  <main>
    <h1>Delegated MCP fixture</h1>
    <p v-if="isPending">Checking session…</p>
    <template v-else-if="isAuthenticated">
      <p v-if="currentUser.data.value?.email" data-testid="signed-in-user">
        Signed in as {{ currentUser.data.value.email }}
      </p>
      <p v-else data-testid="signed-in-user">Finishing account setup…</p>
      <button type="button" @click="signOut()">Sign out</button>
    </template>
    <NuxtLink v-else to="/login">Sign in</NuxtLink>
  </main>
</template>
