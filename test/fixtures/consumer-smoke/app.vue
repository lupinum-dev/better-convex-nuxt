<template>
  <div>{{ Boolean(taskRefs.listTasks) }} {{ listKey }}</div>
</template>

<script setup lang="ts">
import { api } from '#convex/api'

const taskRefs = useTaskRefs()
const listKey = getQueryKey(api.tasks.list, {})
void api.tasks.create
</script>
