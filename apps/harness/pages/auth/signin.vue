<template>
  <main class="page">
    <section class="card">
      <h1>Sign In</h1>
      <p>This route exists so auth redirects have a stable landing page during tests.</p>
    </section>
  </main>
</template>

<script setup lang="ts">
definePageMeta({
  skipAuthTokenFetch: true,
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.card {
  width: min(360px, 100%);
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  background: #fff;
  padding: 24px;
}

h1 {
  margin: 0 0 8px;
  font-size: 1.5rem;
}
</style>
