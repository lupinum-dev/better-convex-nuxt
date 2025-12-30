<template>
  <div class="container">
    <div class="header">
      <h1>My Tasks</h1>
      <NuxtLink to="/" class="back-link">&larr; Back</NuxtLink>
    </div>

    <div v-if="!isAuthenticated" class="auth-warning">
      <p>Please <NuxtLink to="/auth/signin">sign in</NuxtLink> to view your tasks.</p>
    </div>

    <template v-else>
      <!-- Status bar -->
      <div class="status-bar">
        <span
          class="badge"
          :class="{ loading: pending, success: !pending && !error, error: error }"
        >
          {{ pending ? 'Loading...' : error ? 'Error' : 'Ready' }}
        </span>
        <span class="info">Real-time updates enabled</span>
      </div>

      <!-- Add task form -->
      <form class="add-form" @submit.prevent="addTask">
        <input
          v-model="newTaskTitle"
          type="text"
          placeholder="What needs to be done?"
          :disabled="isAdding"
        />
        <button type="submit" :disabled="!newTaskTitle.trim() || isAdding">
          {{ isAdding ? 'Adding...' : 'Add' }}
        </button>
      </form>

      <!-- Error display -->
      <div v-if="error" class="error-box">
        {{ error.message }}
      </div>

      <!-- Tasks list -->
      <div v-else-if="!tasks || tasks.length === 0" class="empty">
        <p>No tasks yet. Add one above!</p>
      </div>

      <ul v-else class="task-list">
        <li v-for="task in tasks" :key="task._id" :class="{ completed: task.completed }">
          <label>
            <input type="checkbox" :checked="task.completed" @change="toggleTask(task._id)" />
            <span>{{ task.title }}</span>
          </label>
          <button class="delete" @click="deleteTask(task._id)">×</button>
        </li>
      </ul>

      <p class="meta">{{ tasks?.length ?? 0 }} task{{ (tasks?.length ?? 0) !== 1 ? 's' : '' }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { api } from '~/convex/_generated/api'
import type { Id } from '~/convex/_generated/dataModel'

const { isAuthenticated } = useConvexAuth()
const client = useConvex()

// Use useConvexQuery for SSR + real-time updates!
// Skip query when not authenticated
const queryArgs = computed(() => isAuthenticated.value ? {} : 'skip' as const)

const {
  data: tasks,
  pending,
  error,
} = useConvexQuery(api.tasks.list, queryArgs, {
  verbose: true, // Check console for detailed logs
})

// Client-only state
const newTaskTitle = ref('')
const isAdding = ref(false)

// Add a new task
async function addTask() {
  if (!newTaskTitle.value.trim() || !client) return

  isAdding.value = true
  try {
    await client.mutation(api.tasks.add, { title: newTaskTitle.value.trim() })
    newTaskTitle.value = ''
    // Real-time subscription updates automatically!
  }
  catch (e) {
    console.error('Failed to add task:', e)
  }
  finally {
    isAdding.value = false
  }
}

// Toggle task completion
async function toggleTask(id: Id<'tasks'>) {
  if (!client) return
  try {
    await client.mutation(api.tasks.toggle, { id })
    // Real-time subscription updates automatically!
  }
  catch (e) {
    console.error('Failed to toggle task:', e)
  }
}

// Delete a task
async function deleteTask(id: Id<'tasks'>) {
  if (!client) return
  try {
    await client.mutation(api.tasks.remove, { id })
    // Real-time subscription updates automatically!
  }
  catch (e) {
    console.error('Failed to delete task:', e)
  }
}
</script>

<style scoped>
.container {
  max-width: 500px;
  margin: 40px auto;
  padding: 20px;
  font-family: system-ui, sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

h1 {
  margin: 0;
}

.back-link {
  color: #3b82f6;
  text-decoration: none;
  font-size: 0.9rem;
}

.back-link:hover {
  text-decoration: underline;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.badge.loading {
  background: #fef3c7;
  color: #92400e;
}

.badge.success {
  background: #d1fae5;
  color: #065f46;
}

.badge.error {
  background: #fee2e2;
  color: #991b1b;
}

.info {
  color: #6b7280;
  font-size: 0.85rem;
}

.error-box {
  background: #fee2e2;
  color: #991b1b;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.auth-warning {
  background: #fff3cd;
  color: #856404;
  padding: 16px;
  border-radius: 8px;
}

.auth-warning a {
  color: #533f03;
  font-weight: bold;
}

.add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.add-form input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
}

.add-form button {
  padding: 10px 20px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
}

.add-form button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.empty {
  text-align: center;
  color: #666;
  padding: 40px;
}

.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.task-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.task-list li label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex: 1;
}

.task-list li.completed span {
  text-decoration: line-through;
  color: #999;
}

.task-list li .delete {
  background: none;
  border: none;
  color: #dc2626;
  font-size: 20px;
  cursor: pointer;
  padding: 0 8px;
  opacity: 0.5;
}

.task-list li .delete:hover {
  opacity: 1;
}

.meta {
  margin-top: 20px;
  color: #666;
  font-size: 0.9em;
  text-align: center;
}
</style>
