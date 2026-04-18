import { requireRecord } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { deleteTodo } from '../../shared/schemas/todo'
import { canDeleteTodo, canReadTodo } from '../auth/checks'
import { query } from '../functions'

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
  guard: canReadTodo as never,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    return { todo }
  },
  authorize: {
    check: ((_actor: any, { todo }: { todo: any }) => canDeleteTodo(todo)) as never,
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

export const previewRemove = query(previewOf(removeTodoOp))
