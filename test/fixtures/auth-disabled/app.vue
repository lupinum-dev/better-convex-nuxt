<script setup lang="ts">
// `useConvexAuth()` is registered unconditionally (vNext §5.1) and must return
// the exact stable `disabled` contract without importing any Better Auth
// runtime into this auth-disabled build.
const auth = useConvexAuth()
</script>

<template>
  <div>{{ auth.status }}</div>
</template>
