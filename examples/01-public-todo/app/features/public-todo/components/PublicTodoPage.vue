<template>
  <div
    class="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-green-50 to-white dark:from-green-950/20 dark:to-neutral-950"
  >
    <UCard class="w-full max-w-lg">
      <template #header>
        <p class="text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">
          Example 01
        </p>
        <h1 class="text-3xl font-bold mt-1">Public Todo</h1>
        <p class="text-sm text-muted mt-2">
          A single query renders the list. Three mutations change it. No auth required.
        </p>
      </template>

      <div class="space-y-4">
        <form class="flex gap-3" @submit.prevent="handleCreate">
          <UInput
            v-model="title"
            placeholder="Write something small and concrete"
            class="flex-1"
            required
            :disabled="createTodoMutation.pending.value"
          />
          <UButton
            type="submit"
            :loading="createTodoMutation.pending.value"
            leading-icon="i-lucide-plus"
          >
            Add
          </UButton>
        </form>

        <UAlert
          v-if="queryError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="Query error"
          :description="queryError"
        />
        <UAlert
          v-if="mutationError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="Mutation error"
          :description="mutationError"
        />

        <div v-if="pending" class="space-y-3">
          <USkeleton v-for="n in 3" :key="n" class="h-12 w-full rounded-xl" />
        </div>

        <p v-else-if="!todoItems.length" class="text-muted text-sm text-center py-8">
          No todos yet. Add the first one above.
        </p>

        <ul v-else class="space-y-2">
          <li
            v-for="todo in todoItems"
            :key="todo._id"
            class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-default bg-elevated"
          >
            <UCheckbox
              :model-value="todo.completed"
              :label="todo.title"
              :ui="{ label: todo.completed ? 'line-through text-muted' : '' }"
              @update:model-value="toggleTodo({ id: todo._id })"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              size="xs"
              square
              aria-label="Delete todo"
              @click="removeTodo({ id: todo._id })"
            />
          </li>
        </ul>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { createTodo } from '~~/shared/features/todos/contract'

import { api } from '#trellis/api'

const { data: todos, pending, error } = await useConvexQuery(api.features.todos.domain.list, {})

const createTodoMutation = useConvexMutation(api.features.todos.domain.create)
const toggleTodo = useConvexMutation(api.features.todos.domain.toggle)
const removeTodo = useConvexMutation(api.features.todos.domain.remove)

const title = ref('')
const todoItems = computed(() => todos.value ?? [])

const queryError = computed(() => error.value?.message ?? '')
const mutationError = computed(
  () =>
    createTodoMutation.error.value?.message ||
    toggleTodo.error.value?.message ||
    removeTodo.error.value?.message ||
    '',
)

async function handleCreate() {
  const parsed = createTodo.zod.safeParse({ title: title.value })
  if (!parsed.success) return

  await createTodoMutation(parsed.data)
  title.value = ''
}
</script>
