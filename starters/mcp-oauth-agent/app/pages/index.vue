<script setup lang="ts">
const { isAuthenticated, isPending, signOut, user } = useConvexAuth()
</script>

<template>
  <main>
    <h1>Delegated MCP fixture</h1>
    <p v-if="isPending">Checking session…</p>
    <template v-else-if="isAuthenticated">
      <p data-testid="signed-in-user">Signed in as {{ user?.email }}</p>
      <button type="button" @click="signOut()">Sign out</button>
    </template>
    <NuxtLink v-else to="/login">Sign in</NuxtLink>
  </main>
</template>
