<template>
  <main class="page">
    <section class="panel">
      <h1>Internal Harness</h1>
      <p>Minimal Nuxt app used for automated smoke coverage.</p>
      <div class="actions">
        <NuxtLink to="/labs/guard-open">Open Guard Route</NuxtLink>
        <NuxtLink to="/labs/guard-protected">Protected Guard Route</NuxtLink>
        <NuxtLink to="/auth/signin">Sign In</NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.panel {
  width: min(560px, 100%);
  padding: 24px;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  background: #fff;
}

h1 {
  margin: 0 0 8px;
  font-size: 1.75rem;
}

p {
  margin: 0;
  color: #52525b;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

a {
  color: #0f172a;
}
</style>
