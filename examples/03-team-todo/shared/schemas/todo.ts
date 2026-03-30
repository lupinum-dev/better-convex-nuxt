/**
 * Why this file exists:
 * The full example uses one source of truth for todo input shapes and table metadata.
 * The same schema objects feed Convex handlers and MCP tool definitions.
 */
import { v } from 'convex/values'

import { defineSchema, defineTableMeta } from 'better-convex-nuxt/schema'

export const todoTable = defineTableMeta({
  description: 'Organization-scoped todo items',
  tenant: {
    scoped: true,
    ownerField: 'ownerId',
  },
})

export const createTodo = defineSchema({
  description: 'Create a team todo',
  args: {
    title: v.string(),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'A team-visible task stored inside the current organization',
      examples: ['Prepare sprint plan', 'Review beta feedback'],
    },
  },
})

export const setTodoCompleted = defineSchema({
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

export const deleteTodo = defineSchema({
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

export const listTodos = defineSchema({
  description: 'List all todos in the current organization',
  args: {},
})
