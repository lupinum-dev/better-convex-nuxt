import { createTodo } from '../../shared/features/todos/contract'
import { hasMinimumRole, hasWorkspace } from '../auth/guards'
import { mutation, query } from '../functions'

export const list = query({
  args: {},
  guard: hasWorkspace,
  handler: async (ctx) => {
    const actor = await ctx.actor()

    return await ctx.db
      .query('todos')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: createTodo.args,
  guard: hasWorkspace.and(hasMinimumRole('member')),
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    return await ctx.db.insert('todos', {
      workspaceId: actor.tenantId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})
