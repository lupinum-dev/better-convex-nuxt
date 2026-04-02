/**
 * Feed Functions - Real-time demo
 *
 * Demonstrates real-time subscriptions with useConvexQuery.
 */

import { can, enforce } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canCreateFeed, canDeleteFeed, canViewAll } from './auth/checks'
import { withCan } from './auth/resource'

/**
 * List all feed items, sorted by creation time (newest first)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return []
    enforce(actor, 'Read feed', canViewAll)

    const items = await ctx.db.query('feedItems').withIndex('by_created').order('desc').take(50)

    return items.map((item) =>
      withCan(item, {
        'feed.delete': can(actor, canDeleteFeed(item)),
      }),
    )
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
    const actor = await getActor(ctx)
    enforce(actor, 'Read feed', canViewAll)

    let query = ctx.db.query('feedItems').withIndex('by_created').order('desc')

    // Apply type filter if specified
    if (args.type) {
      query = query.filter((q) => q.eq(q.field('type'), args.type))
    }

    const items = await query.take(args.limit ?? 50)
    return items.map((item) =>
      withCan(item, {
        'feed.delete': can(actor, canDeleteFeed(item)),
      }),
    )
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
    const actor = await getActor(ctx)
    enforce(actor, 'Create feed item', canCreateFeed)

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
      .first()

    const itemId = await ctx.db.insert('feedItems', {
      content: args.content,
      type: args.type,
      authorId: actor.userId,
      authorName: user?.displayName || 'Anonymous',
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
    const actor = await getActor(ctx)
    enforce(actor, 'Delete feed item', actor !== null)

    const item = await ctx.db.get(args.id)
    if (!item) {
      throw new Error('Item not found')
    }
    enforce(actor, 'Delete feed item', canDeleteFeed(item))

    await ctx.db.delete(args.id)
  },
})
