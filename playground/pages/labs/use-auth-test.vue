<template>
  <div class="container">
    <h1>useAuth Test</h1>

    <div class="panel">
      <div class="row"><span>isAuthenticated</span><strong>{{ isAuthenticated }}</strong></div>
      <div class="row"><span>isPending</span><strong>{{ isPending }}</strong></div>
      <div class="row"><span>hasClient</span><strong>{{ client ? 'yes' : 'no' }}</strong></div>
      <div class="row"><span>signIn.email type</span><strong>{{ signInEmailType }}</strong></div>
      <div class="row"><span>signUp.email type</span><strong>{{ signUpEmailType }}</strong></div>
    </div>

    <div class="panel actions">
      <button class="btn" @click="callSignIn">Call signIn.email()</button>
      <button class="btn" @click="callSignUp">Call signUp.email()</button>
      <pre class="result">{{ resultText }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})

const { isAuthenticated, isPending, client, signIn, signUp } = useAuth()
const resultText = ref('(idle)')

const signInEmailType = computed(() => typeof signIn.email)
const signUpEmailType = computed(() => typeof signUp.email)

async function callSignIn() {
  const result = await signIn.email({
    email: 'stub@example.com',
    password: 'password123',
  })
  resultText.value = JSON.stringify(result, null, 2)
}

async function callSignUp() {
  const result = await signUp.email({
    name: 'Stub User',
    email: 'stub@example.com',
    password: 'password123',
  })
  resultText.value = JSON.stringify(result, null, 2)
}
</script>

<style scoped>
.container {
  max-width: 720px;
  margin: 0 auto;
}

.panel {
  background: #f6f7f9;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-family: monospace;
}

.actions {
  display: grid;
  gap: 10px;
}

.btn {
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  padding: 10px 14px;
  cursor: pointer;
  width: fit-content;
}

.result {
  margin: 0;
  background: #111827;
  color: #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  min-height: 80px;
  overflow: auto;
  font-size: 12px;
}
</style>

