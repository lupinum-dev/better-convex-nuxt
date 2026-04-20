import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createTodo = defineArgs({
  description: 'Create a team todo',
  args: {
    title: v.string(),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'A team-visible task stored inside the current tenant',
      examples: ['Prepare sprint plan', 'Review beta feedback'],
    },
  },
})

export const setTodoCompleted = defineArgs({
  description: 'Update a todo completion flag',
  args: {
    id: v.id('todos'),
    completed: v.boolean(),
  },
  meta: {
    id: {
      label: 'Todo ID',
      description: 'The todo document to update',
    },
    completed: {
      label: 'Completed',
      description: 'Whether the todo should be marked complete',
      examples: [true],
    },
  },
})

export const deleteTodo = defineArgs({
  description: 'Delete a team todo',
  args: {
    id: v.id('todos'),
  },
  meta: {
    id: {
      label: 'Todo ID',
      description: 'The todo document to delete permanently',
    },
  },
})

export const listTodos = defineArgs({
  description: 'List all todos in the current tenant',
  args: {},
})

export const processTodoSyncWebhook = defineArgs({
  description: 'Replay-safe internal webhook payload for syncing a workspace todo.',
  args: {
    workspaceId: v.id('workspaces'),
    eventId: v.string(),
    title: v.string(),
    completed: v.optional(v.boolean()),
    externalId: v.optional(v.string()),
  },
})
