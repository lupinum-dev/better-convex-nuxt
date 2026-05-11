<script setup lang="ts">
import { createTodo } from '~~/shared/features/todos/contract'

import { api } from '#trellis/api'

const title = ref('')

const { data: todos } = await useConvexQuery(api.features.todos.domain.list, {})
const createTodoMutation = useConvexMutation(api.features.todos.domain.create)
const toggleTodo = useConvexMutation(api.features.todos.domain.toggle)
const removeTodo = useConvexMutation(api.features.todos.domain.remove)

async function handleCreateTodo() {
  const parsed = createTodo.zod.safeParse({ title: title.value })
  if (!parsed.success) return

  await createTodoMutation(parsed.data)
  title.value = ''
}
</script>

<template>
  <main style="max-width: 720px; margin: 0 auto; padding: 40px 16px">
    <h1>Public Starter</h1>
    <p>Trellis app starter: live query plus public mutations, no auth required.</p>

    <div style="display: grid; gap: 16px">
      <div style="display: flex; gap: 8px">
        <input v-model="title" type="text" placeholder="Add a todo" />
        <button :disabled="createTodoMutation.pending.value" @click="handleCreateTodo">Add</button>
      </div>

      <ul style="display: grid; gap: 8px; padding-left: 20px">
        <li v-for="todo in todos ?? []" :key="todo._id">
          <label style="display: flex; gap: 8px; align-items: center">
            <input
              type="checkbox"
              :checked="todo.completed"
              @change="toggleTodo({ id: todo._id })"
            />
            <span>{{ todo.title }}</span>
          </label>
          <button @click="removeTodo({ id: todo._id })">Delete</button>
        </li>
      </ul>
    </div>
  </main>
</template>
