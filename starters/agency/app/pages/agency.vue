<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const agencyOrganizationId = ref('' as Id<'organizations'>)
const { data: clients } = await useConvexQuery(api.organizationLinks.listClients, {
  agencyOrganizationId
})
</script>

<template>
  <main class="shell">
    <p>Agency starter</p>
    <h1>Client workspaces</h1>

    <label>
      Agency organization id
      <input v-model="agencyOrganizationId" placeholder="Paste an agency organization id" />
    </label>

    <nav class="list">
      <NuxtLink
        v-for="client in clients ?? []"
        :key="client._id"
        :to="`/clients/${client._id}?agencyOrganizationId=${agencyOrganizationId}`"
      >
        {{ client.name }}
      </NuxtLink>
    </nav>
  </main>
</template>

<style>
body {
  margin: 0;
  background: #f8fafc;
  color: #18181b;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

.shell {
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 24px;
}

input {
  display: block;
  width: 100%;
  height: 40px;
  margin: 8px 0 20px;
  padding: 0 12px;
  border: 1px solid #d6dae1;
  border-radius: 6px;
  font: inherit;
}

.list {
  display: grid;
  gap: 8px;
}

.list a {
  padding: 14px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: white;
  color: inherit;
  text-decoration: none;
}
</style>

