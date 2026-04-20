import { requireRecord } from '@lupinum/trellis/auth'

import { createTodo, listTodos, setTodoCompleted } from '../../../shared/features/todos/contract'
import type { Doc, Id } from '../../_generated/dataModel'
import { mutation, query } from '../../functions'
import { todoCapabilities } from './capabilities'
import { canUpdateTodo } from './checks'
import { removeTodoOp } from './operations'
import { todoCreate, todoRead } from './permissions'

function requireWorkspaceActor<
  TActor extends { userId: string; tenantId?: Id<'workspaces'> | null },
>(actor: TActor | null): TActor {
  if (!actor?.tenantId) throw new Error('Current actor is not assigned to a workspace.')
  return actor
}

function requireWorkspaceTenant(actor: { tenantId?: Id<'workspaces'> | null } | null) {
  if (!actor?.tenantId) throw new Error('Current actor is not assigned to a workspace.')
  return actor.tenantId
}

export const list = query({
  args: listTodos.args,
  guard: todoRead,
  handler: async (ctx) => {
    const actor = requireWorkspaceActor(await ctx.actor())
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
  guard: todoRead,
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
  guard: todoCreate,
  handler: async (ctx, args) => {
    const actor = requireWorkspaceActor(await ctx.actor())
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
  guard: todoRead,
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
