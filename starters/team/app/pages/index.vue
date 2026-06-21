<script setup lang="ts">
const { isAuthenticated, isPending } = useConvexAuth()
</script>

<template>
  <main class="shell">
    <section class="header">
      <p>Team starter</p>
      <h1>Organizations</h1>
    </section>

    <AuthPanel
      v-if="!isAuthenticated"
      :checking="isPending"
      message="Create an account or sign in to manage organizations."
    />

    <OrganizationWorkspace v-else />
  </main>
</template>
