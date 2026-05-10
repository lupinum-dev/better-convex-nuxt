import { createTodo, listTodos } from '../../../shared/features/todos/contract'

import { mutation, query } from '../../functions'
import { todoCreate, workspaceRead } from './permissions'

export const list = query.protected({
  args: listTodos.args,
  guard: workspaceRead,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    if (!actor?.tenantId) throw new Error('Current actor is not assigned to a workspace.')

    return await ctx.db
      .query('todos')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const create = mutation.protected({
  args: createTodo.args,
  guard: todoCreate,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor?.tenantId) throw new Error('Current actor is not assigned to a workspace.')

    return await ctx.db.insert('todos', {
      workspaceId: actor.tenantId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})
