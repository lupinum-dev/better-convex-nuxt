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
        <!-- Composer -->
        <form class="flex gap-3" @submit.prevent="handleCreate">
          <UInput
            v-model="title"
            placeholder="Write something small and concrete"
            class="flex-1"
            required
            :disabled="createTodo.pending.value"
          />
          <UButton type="submit" :loading="createTodo.pending.value" leading-icon="i-lucide-plus">
            Add
          </UButton>
        </form>

        <!-- Errors -->
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

        <!-- Loading skeletons -->
        <div v-if="pending" class="space-y-3">
          <USkeleton v-for="n in 3" :key="n" class="h-12 w-full rounded-xl" />
        </div>

        <!-- Empty state -->
        <p v-else-if="!todos?.length" class="text-muted text-sm text-center py-8">
          No todos yet. Add the first one above.
        </p>

        <!-- List -->
        <ul v-else class="space-y-2">
          <li
            v-for="todo in todos"
            :key="todo._id"
            class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-default bg-elevated"
          >
            <UCheckbox
              :model-value="todo.completed"
              :label="todo.title"
              :ui="{
                label: todo.completed ? 'line-through text-muted' : '',
              }"
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
/**
 * Why this file exists:
 * This page is the shortest end-to-end example of the client API.
 * The goal is to show "query data, call mutation, watch the list update" with as little noise as possible.
 * Presentation layer uses Nuxt UI — all Convex logic is identical to the raw version.
 */
import { computed, ref } from 'vue'

import { api } from '~/convex/_generated/api'

const toast = useToast()

// One live query powers the whole page.
const { data: todos, pending, error } = await useConvexQuery(api.todos.list, {})

// The mutation composables are callable functions with reactive state attached.
const createTodo = useConvexMutation(api.todos.create)
const toggleTodo = useConvexMutation(api.todos.toggle)
const removeTodo = useConvexMutation(api.todos.remove)

const title = ref('')

const queryError = computed(() => error.value?.message ?? '')
const mutationError = computed(
  () =>
    createTodo.error.value?.message ||
    toggleTodo.error.value?.message ||
    removeTodo.error.value?.message ||
    '',
)

async function handleCreate() {
  // The mutation only needs the business arg defined by the shared schema.
  await createTodo({ title: title.value })

  // The query updates automatically after the mutation settles, so the page does not refetch manually.
  title.value = ''

  toast.add({
    title: 'Todo added',
    color: 'success',
    icon: 'i-lucide-circle-check',
  })
}
</script>
