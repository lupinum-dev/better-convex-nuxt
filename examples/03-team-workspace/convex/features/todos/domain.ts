import { requireRecord } from '@lupinum/trellis/auth'

import { createTodo, listTodos, setTodoCompleted } from '../../../shared/features/todos/contract'
import type { Doc, Id } from '../../_generated/dataModel'
import { mutation, query } from '../../functions'
import { canUpdateTodo } from './checks'
import { removeTodoOp } from './operations'
import { todoCreate, todoRead } from './permissions'
import { todoCapabilities } from './recordAccess'

function requireWorkspaceActor<
  TActor extends { userId: string; workspaceId?: Id<'workspaces'> | null },
>(appIdentity: TActor | null): TActor {
  if (!appIdentity?.workspaceId)
    throw new Error('Current appIdentity is not assigned to a workspace.')
  return appIdentity
}

function requireWorkspaceTenant(appIdentity: { workspaceId?: Id<'workspaces'> | null } | null) {
  if (!appIdentity?.workspaceId)
    throw new Error('Current appIdentity is not assigned to a workspace.')
  return appIdentity.workspaceId
}

export const list = query.protected({
  args: listTodos.args,
  guard: todoRead,
  handler: async (ctx) => {
    const appIdentity = requireWorkspaceActor(await ctx.appIdentity())
    const workspaceId = requireWorkspaceTenant(appIdentity)
    const todos = await ctx.db
      .query('todos')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .order('desc')
      .collect()

    return todoCapabilities.attach(appIdentity, todos)
  },
})

export const get = query.protected({
  args: removeTodoOp.args,
  guard: todoRead,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id as Id<'todos'>)
    requireRecord(todo, 'Todo')
    return { todo: todo as Doc<'todos'> }
  },
  handler: async (ctx, _args, { todo }) => {
    return todoCapabilities.attach(await ctx.appIdentity(), todo)
  },
})

export const create = mutation.protected({
  args: createTodo.args,
  guard: todoCreate,
  handler: async (ctx, args) => {
    const appIdentity = requireWorkspaceActor(await ctx.appIdentity())
    const workspaceId = requireWorkspaceTenant(appIdentity)

    return ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      ownerId: appIdentity.userId,
      workspaceId,
      createdAt: Date.now(),
    })
  },
})

export const setCompleted = mutation.protected({
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

export const remove = mutation.protected(removeTodoOp)
