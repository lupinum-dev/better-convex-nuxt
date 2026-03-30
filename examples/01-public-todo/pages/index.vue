<template>
  <main class="page">
    <section class="panel">
      <p class="eyebrow">Example 01</p>
      <h1>Public Todo</h1>
      <p class="lede">
        This page is intentionally simple: a single query renders the list and three mutations
        change it.
      </p>

      <form class="composer" @submit.prevent="handleCreate">
        <label class="label" for="title">New todo</label>
        <div class="composer-row">
          <input
            id="title"
            v-model="title"
            class="input"
            type="text"
            placeholder="Write something small and concrete"
            required
          />
          <button class="button" type="submit" :disabled="createTodo.pending.value">
            {{ createTodo.pending.value ? 'Adding...' : 'Add' }}
          </button>
        </div>
      </form>

      <p v-if="queryError" class="error">{{ queryError }}</p>
      <p v-if="mutationError" class="error">{{ mutationError }}</p>

      <ul v-if="todos?.length" class="list">
        <li v-for="todo in todos" :key="todo._id" class="item">
          <label class="checkbox-row">
            <input
              type="checkbox"
              :checked="todo.completed"
              @change="toggleTodo({ id: todo._id })"
            />
            <span :class="{ done: todo.completed }">{{ todo.title }}</span>
          </label>
          <button class="ghost" type="button" @click="removeTodo({ id: todo._id })">
            Delete
          </button>
        </li>
      </ul>

      <p v-else-if="pending" class="empty">Loading todos...</p>
      <p v-else class="empty">No todos yet. Add the first one above.</p>
    </section>
  </main>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * This page is the shortest end-to-end example of the client API.
 * The goal is to show "query data, call mutation, watch the list update" with as little noise as possible.
 */
import { computed, ref } from 'vue'

import { api } from '~/convex/_generated/api'

// One live query powers the whole page.
const { data: todos, pending, error } = await useConvexQuery(api.todos.list, {})

// The mutation composables are callable functions with reactive state attached.
const createTodo = useConvexMutation(api.todos.create)
const toggleTodo = useConvexMutation(api.todos.toggle)
const removeTodo = useConvexMutation(api.todos.remove)

const title = ref('')

const queryError = computed(() => error.value?.message ?? '')
const mutationError = computed(() =>
  createTodo.error.value?.message
  || toggleTodo.error.value?.message
  || removeTodo.error.value?.message
  || '',
)

async function handleCreate() {
  // The mutation only needs the business arg defined by the shared schema.
  await createTodo({
    title: title.value,
  })

  // The query updates automatically after the mutation settles, so the page does not refetch manually.
  title.value = ''
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  background:
    radial-gradient(circle at top left, rgba(34, 197, 94, 0.16), transparent 28rem),
    linear-gradient(180deg, #f8fafc 0%, #eefbf2 100%);
  color: #0f172a;
}

.panel {
  width: min(100%, 42rem);
  padding: 2rem;
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
}

.eyebrow {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #15803d;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3rem);
}

.lede {
  margin: 0.75rem 0 1.5rem;
  color: #475569;
}

.composer {
  margin-bottom: 1.5rem;
}

.label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.composer-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
}

.input,
.button,
.ghost {
  border-radius: 0.9rem;
  font: inherit;
}

.input {
  min-width: 0;
  padding: 0.9rem 1rem;
  border: 1px solid #cbd5e1;
  background: white;
}

.button {
  padding: 0.9rem 1.2rem;
  border: none;
  background: #15803d;
  color: white;
  font-weight: 700;
}

.ghost {
  padding: 0.45rem 0.8rem;
  border: 1px solid #cbd5e1;
  background: white;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.85rem;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
  border-radius: 1rem;
  background: white;
  border: 1px solid #e2e8f0;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.done {
  color: #64748b;
  text-decoration: line-through;
}

.error {
  color: #b91c1c;
}

.empty {
  color: #64748b;
}

@media (max-width: 640px) {
  .composer-row {
    grid-template-columns: 1fr;
  }

  .item {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
