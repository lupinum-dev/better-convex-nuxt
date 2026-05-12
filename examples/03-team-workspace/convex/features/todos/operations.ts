import { requireRecord } from '@lupinum/trellis/auth'
import {
  defineOperationDescriptor,
  implementOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  operationPreviewValidator,
} from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import { deleteTodo } from '../../../shared/features/todos/contract'
import { canDeleteTodo } from './checks'
import { todoRead } from './permissions'

export const removeTodoDescriptor = defineOperationDescriptor({
  id: 'todos.remove',
  name: 'removeTodo',
  kind: 'destructive',
  args: deleteTodo.args,
  returns: v.null(),
  previewReturns: operationPreviewValidator({
    confirm: v.object({
      operation: v.literal('todos.remove'),
      targetId: v.id('todos'),
      affectedCounts: v.object({
        todos: v.number(),
      }),
    }),
  }),
  permission: todoRead,
  safety: 'destructive-write',
})

export const removeTodoOp = implementOperation(removeTodoDescriptor, {
  guard: todoRead,
  permission: todoRead,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    return { todo }
  },
  authorize: {
    check: (_actor, { todo }) => canDeleteTodo(todo),
  },
  preview: async (_ctx, _args, { todo }) =>
    operationPreview({
      summary: `Will permanently delete "${todo.title}"`,
      warnings: [operationIssue({ code: 'permanent-delete', message: 'This cannot be undone.' })],
      effects: [operationEffect({ kind: 'todos', summary: 'Todos deleted', count: 1 })],
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
