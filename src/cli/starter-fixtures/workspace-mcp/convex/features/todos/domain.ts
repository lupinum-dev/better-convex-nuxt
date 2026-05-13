import { createTodo, listTodos } from '../../../shared/features/todos/contract'
import { mutation, query } from '../../functions'
import { todoCreate, workspaceRead } from './permissions'

export const list = query.protected({
  args: listTodos.args,
  guard: workspaceRead,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity?.workspaceId)
      throw new Error('Current appIdentity is not assigned to a workspace.')

    return await ctx.db
      .query('todos')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', appIdentity.workspaceId))
      .order('desc')
      .collect()
  },
})

export const create = mutation.protected({
  args: createTodo.args,
  guard: todoCreate,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity?.workspaceId)
      throw new Error('Current appIdentity is not assigned to a workspace.')

    return await ctx.db.insert('todos', {
      workspaceId: appIdentity.workspaceId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})
