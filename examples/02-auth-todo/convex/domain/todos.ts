import { v } from 'convex/values'

import { createTodo } from '../../shared/schemas/todo'
import { isAuthenticated } from '../auth/checks'
import { mutation, query } from '../functions'
import { loadOwnedResource } from '../permissions/resources'

export const list = query({
  args: {},
  guard: isAuthenticated,
  handler: async (ctx) => {
    const actor = await ctx.actor()

    // `db` is raw here because this app is user-scoped, not tenant-scoped.
    // The handler enforces ownership by filtering with the guaranteed actor.
    return await ctx.db
      .query('todos')
      .withIndex('by_owner', (q) => q.eq('ownerId', actor.userId))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: createTodo.args,
  guard: isAuthenticated,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    // Ownership is explicit in the inserted row.
    return await ctx.db.insert('todos', {
      ownerId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation({
  args: { id: v.id('todos') },
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const actor = await ctx.actor()
    const todo = await ctx.db.get(args.id)
    return { todo: loadOwnedResource(actor, todo, 'Todo') }
  },
  handler: async (ctx, args, { todo }) => {
    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = mutation({
  args: { id: v.id('todos') },
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const actor = await ctx.actor()
    const todo = await ctx.db.get(args.id)
    return { todo: loadOwnedResource(actor, todo, 'Todo') }
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
