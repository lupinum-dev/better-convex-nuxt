/**
 * Messages Functions - Pagination demo
 *
 * Demonstrates pagination with useConvexPaginatedQuery.
 */

import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { paginationOptsValidator } from 'convex/server'

/**
 * List messages with cursor-based pagination
 */
export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_created')
      .order('desc')
      .paginate(args.paginationOpts)

    return messages
  }
})

/**
 * Add a new message
 */
export const add = mutation({
  args: {
    content: v.string()
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

    const messageId = await ctx.db.insert('messages', {
      content: args.content,
      authorId: identity.subject,
      authorName: user?.displayName || identity.name || 'Anonymous',
      createdAt: Date.now()
    })

    return messageId
  }
})

/**
 * Seed messages for demo
 */
export const seed = mutation({
  args: {
    count: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    const authorName = user?.displayName || identity.name || 'Demo User'
    const count = args.count || 20

    const sampleMessages = [
      'Just deployed a new feature to production!',
      'Anyone else excited about the new Convex updates?',
      'Real-time databases are the future',
      'Working on pagination implementation today',
      'The weather is beautiful outside',
      'Coffee is essential for coding',
      'Just fixed a tricky bug',
      'Learning new things every day',
      'Team standup in 5 minutes',
      'Code review time!',
      'Documentation is important',
      'Testing, testing, 1-2-3',
      'Just pushed 50 commits',
      'Time for a break',
      'Debugging mode activated',
      'Found an interesting article about WebSockets',
      'The build is green!',
      'Refactoring complete',
      'New PR ready for review',
      'Sprint planning tomorrow'
    ]

    const messageIds = []
    for (let i = 0; i < count; i++) {
      const content = sampleMessages[i % sampleMessages.length]
      const messageId = await ctx.db.insert('messages', {
        content: `${content} (#${i + 1})`,
        authorId: identity.subject,
        authorName,
        createdAt: Date.now() - i * 60000 // Stagger timestamps
      })
      messageIds.push(messageId)
    }

    return { created: messageIds.length }
  }
})

/**
 * Clear all messages (for demo reset)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const messages = await ctx.db.query('messages').collect()

    for (const message of messages) {
      await ctx.db.delete(message._id)
    }

    return { deleted: messages.length }
  }
})
