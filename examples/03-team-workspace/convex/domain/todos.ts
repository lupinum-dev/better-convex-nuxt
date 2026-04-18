import { requireRecord } from '@lupinum/trellis/auth'
import type { Doc, Id } from '../_generated/dataModel'

import { createTodo, listTodos, setTodoCompleted } from '../../shared/schemas/todo'
import { todoCapabilities } from '../auth/capabilities'
import { canCreateTodo, canReadTodo, canUpdateTodo } from '../auth/checks'
import { mutation, query } from '../functions'
import { removeTodoOp } from '../operations/todos'

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
  args: removeTodoOp.args,
  guard: canReadTodo,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id as Id<'todos'>)
    requireRecord(todo, 'Todo')
    return { todo: todo as Doc<'todos'> }
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
    const todo = await ctx.db.get(args.id as Id<'todos'>)
    requireRecord(todo, 'Todo')
    return { todo: todo as Doc<'todos'> }
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

export const remove = mutation(removeTodoOp)
