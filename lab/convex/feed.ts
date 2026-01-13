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
    const items = await ctx.db
      .query('feedItems')
      .withIndex('by_created')
      .order('desc')
      .take(50)

    return items
  }
})

/**
 * Add a new feed item
 */
export const add = mutation({
  args: {
    content: v.string(),
    type: v.union(v.literal('message'), v.literal('task'), v.literal('event'))
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    // Get user for display name and role check
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    // Check permission: viewers cannot create feed items
    if (user?.role === 'viewer') {
      throw new Error('Permission denied: Viewers can only read content. Switch to Member, Admin, or Owner role to create posts.')
    }

    const itemId = await ctx.db.insert('feedItems', {
      content: args.content,
      type: args.type,
      authorId: identity.subject,
      authorName: user?.displayName || identity.name || 'Anonymous',
      createdAt: Date.now()
    })

    return itemId
  }
})

/**
 * Remove a feed item
 */
export const remove = mutation({
  args: {
    id: v.id('feedItems')
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

    // Get user role
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    // Permission check:
    // - admin can delete any item
    // - member can delete own items only
    // - viewer cannot delete anything
    const isAdmin = user?.role === 'admin'
    const isOwner = item.authorId === identity.subject
    const isMember = user?.role === 'member'

    if (!isAdmin && !(isMember && isOwner)) {
      if (user?.role === 'viewer') {
        throw new Error('Permission denied: Viewers cannot delete posts. Switch to a higher role to delete content.')
      }
      throw new Error('Permission denied: You can only delete your own posts. Admins can delete any post.')
    }

    await ctx.db.delete(args.id)
  }
})
