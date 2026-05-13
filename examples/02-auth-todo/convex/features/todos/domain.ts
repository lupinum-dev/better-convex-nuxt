import { deny } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { createTodo } from '../../../shared/features/todos/contract'
import { isAuthenticated } from '../../auth/guards'
import { mutation, query } from '../../functions'

export const list = query.protected({
  args: {},
  guard: isAuthenticated,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()

    return await ctx.db
      .query('todos')
      .withIndex('by_owner', (q) => q.eq('ownerId', appIdentity.userId))
      .order('desc')
      .collect()
  },
})

export const create = mutation.protected({
  args: createTodo.args,
  guard: isAuthenticated,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    return await ctx.db.insert('todos', {
      ownerId: appIdentity.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation.protected({
  args: { id: v.id('todos') },
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const todo = await ctx.db.get(args.id)
    if (!todo || todo.ownerId !== appIdentity.userId) {
      throw deny('Todo not found.')
    }
    return { todo }
  },
  handler: async (ctx, args, { todo }) => {
    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = mutation.protected({
  args: { id: v.id('todos') },
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const todo = await ctx.db.get(args.id)
    if (!todo || todo.ownerId !== appIdentity.userId) {
      throw deny('Todo not found.')
    }
    return { todo }
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
