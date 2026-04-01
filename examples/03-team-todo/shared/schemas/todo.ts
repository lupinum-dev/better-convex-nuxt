/**
 * Why this file exists:
 * These args definitions are shared across Convex handlers and MCP tools.
 * The folder lives at `shared/` because both runtimes need to import the same plain data contracts.
 */
import { v } from 'convex/values'

import { defineArgs } from 'better-convex-nuxt/args'

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
