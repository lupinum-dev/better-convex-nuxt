/**
 * Feed Functions - Real-time demo
 *
 * Demonstrates real-time subscriptions with useConvexQuery.
 */

import { v } from 'convex/values'

import { mutation, query } from './_generated/server'

/**
 * List all feed items, sorted by creation time (newest first)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query('feedItems').withIndex('by_created').order('desc').take(50)

    return items
  },
})

/**
 * List feed items with optional type filter
 * Used by the reactive args demo to show how query args can be reactive
 */
export const listFiltered = query({
  args: {
    type: v.optional(v.union(v.literal('message'), v.literal('task'), v.literal('event'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query('feedItems').withIndex('by_created').order('desc')

    // Apply type filter if specified
    if (args.type) {
      query = query.filter((q) => q.eq(q.field('type'), args.type))
    }

    const items = await query.take(args.limit ?? 50)
    return items
  },
})

/**
 * Add a new feed item
 */
export const add = mutation({
  args: {
    content: v.string(),
    type: v.union(v.literal('message'), v.literal('task'), v.literal('event')),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    // Get user for display name
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    const itemId = await ctx.db.insert('feedItems', {
      content: args.content,
      type: args.type,
      authorId: identity.subject,
      authorName: user?.displayName || identity.name || 'Anonymous',
      createdAt: Date.now(),
    })

    return itemId
  },
})

/**
 * Remove a feed item
 */
export const remove = mutation({
  args: {
    id: v.id('feedItems'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const item = await ctx.db.get(args.id)
    if (!item) {
      throw new Error('Item not found')
    }

    const isOwner = item.authorId === identity.subject

    if (!isOwner) {
      throw new Error('Permission denied: You can only delete your own posts.')
    }

    await ctx.db.delete(args.id)
  },
})
