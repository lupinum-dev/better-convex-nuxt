import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server'
import { ConvexError, v } from 'convex/values'

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('todos').withIndex('by_created').order('desc').take(50)
  },
})

export const create = mutation({
  args: {
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const text = args.text.trim()
    if (!text) {
      throw new ConvexError('Todo text is required')
    }

    return await ctx.db.insert('todos', {
      text,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation({
  args: {
    id: v.id('todos'),
  },
  handler: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    if (!todo) {
      throw new ConvexError('Todo not found')
    }

    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = mutation({
  args: {
    id: v.id('todos'),
  },
  handler: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    if (!todo) {
      throw new ConvexError('Todo not found')
    }

    await ctx.db.delete(args.id)
  },
})
