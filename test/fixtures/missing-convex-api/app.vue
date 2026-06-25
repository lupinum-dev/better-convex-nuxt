<script setup lang="ts">
import { api } from '#convex/api'

const placeholderMessage = api.__betterConvexNuxtError
</script>

<template>
  <div>{{ placeholderMessage }}</div>
</template>
