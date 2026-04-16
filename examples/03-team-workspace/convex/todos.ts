import { requireRecord } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { createTodo, deleteTodo, listTodos, setTodoCompleted } from '../shared/schemas/todo'
import type { Id } from './_generated/dataModel'
import { todoCapabilities } from './auth/capabilities'
import { canCreateTodo, canDeleteTodo, canReadTodo, canUpdateTodo } from './auth/checks'
import { mutation, query } from './functions'

function requireWorkspaceTenant(actor: { tenantId?: Id<'workspaces'> | null }) {
  if (!actor.tenantId) throw new Error('Current actor is not assigned to a workspace.')
  return actor.tenantId
}

export const list = query({
  args: listTodos.args,
  guard: canReadTodo,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)
    const todos = await ctx.db
      .query('todos')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .order('desc')
      .collect()

    return todoCapabilities.attach(actor, todos)
  },
})

export const get = query({
  args: deleteTodo.args,
  guard: canReadTodo,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    return { todo }
  },
  handler: async (ctx, _args, { todo }) => {
    return todoCapabilities.attach(await ctx.actor(), todo)
  },
})

export const create = mutation({
  args: createTodo.args,
  guard: canCreateTodo,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    return ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      ownerId: actor.userId,
      workspaceId,
      createdAt: Date.now(),
    })
  },
})

export const setCompleted = mutation({
  args: setTodoCompleted.args,
  // Entry gate: actor can see todos. authorize below checks update rights on this specific todo.
  guard: canReadTodo,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    return { todo }
  },
  authorize: {
    check: (_actor, { todo }) => canUpdateTodo(todo),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      completed: args.completed,
    })
  },
})

export const removeTodoOp = defineOperation({
  id: 'todos.remove',
  name: 'removeTodo',
  kind: 'destructive',
  args: deleteTodo.args,
  returns: v.null(),
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
      warn: v.string(),
      affects: v.object({
        todos: v.number(),
      }),
    }),
    confirm: v.object({
      operation: v.literal('todos.remove'),
      targetId: v.id('todos'),
      affectedCounts: v.object({
        todos: v.number(),
      }),
    }),
  }),
  guard: canReadTodo,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    return { todo }
  },
  authorize: {
    check: (_actor, { todo }) => canDeleteTodo(todo),
  },
  preview: async (_ctx, _args, { todo }) => ({
    display: {
      summary: `Will permanently delete "${todo.title}"`,
      warn: 'This cannot be undone',
      affects: { todos: 1 },
    },
    confirm: {
      operation: 'todos.remove',
      targetId: todo._id,
      affectedCounts: { todos: 1 },
    },
  }),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
    return null
  },
})

export const remove = mutation(removeTodoOp)
export const previewRemove = query(previewOf(removeTodoOp))
