<template>
  <div>{{ Boolean(taskRefs.listTasks) }}</div>
</template>

<script setup lang="ts">
import { api } from '#convex/api'

const taskRefs = useTaskRefs()
void api.tasks.create
</script>
