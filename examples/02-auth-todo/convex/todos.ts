import { authorize } from 'better-convex-nuxt/auth'
import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

import { createTodo } from '../shared/schemas/todo'
import { getActor } from './auth/actor'
import { isAuthenticated } from './auth/checks'
import { loadOwnedResource } from './auth/scope'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Read todos', isAuthenticated)

    // `db` is raw here because this app is user-scoped, not tenant-scoped.
    // The handler enforces ownership by filtering with the guaranteed actor.
    return await ctx.db
      .query('todos')
      .withIndex('by_user', q => q.eq('userId', actor.userId))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: createTodo.args,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Create todo', isAuthenticated)

    // Ownership is explicit in the inserted row.
    return await ctx.db.insert('todos', {
      userId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Update todo', isAuthenticated)

    const todo = loadOwnedResource(actor, await ctx.db.get(args.id), 'Todo')

    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Delete todo', isAuthenticated)

    loadOwnedResource(actor, await ctx.db.get(args.id), 'Todo')

    await ctx.db.delete(args.id)
  },
})
