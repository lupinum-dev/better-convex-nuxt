/**
 * Posts Module
 *
 * CRUD operations demonstrating the permission system with a minimal
 * signed-in + ownership model (no org roles). See permissions.config.ts.
 */

import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { query, mutation } from './_generated/server'
import { getUser, authorize } from './lib/permissions'

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 50) {
    throw new Error('Page size must be an integer from 1 to 50')
  }
}

function normalizeTitle(title: string) {
  const normalized = title.trim()
  if (!normalized || normalized.length > 120) {
    throw new Error('Post title must be between 1 and 120 characters')
  }
  return normalized
}

function normalizeContent(content: string) {
  const normalized = content.trim()
  if (!normalized || normalized.length > 20_000) {
    throw new Error('Post content must be between 1 and 20000 characters')
  }
  return normalized
}

// ============================================
// LIST
// ============================================
// Returns the signed-in user's own posts.

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx)
    if (!user) return []

    return await ctx.db
      .query('posts')
      .withIndex('by_owner', (q) => q.eq('ownerId', user.authId))
      .order('desc')
      .take(100)
  },
})

// ============================================
// LIST PAGINATED (auth-protected)
// ============================================
// Returns paginated posts owned by the signed-in user.
// Used to exercise SSR with auth.

export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    requirePageSize(args.paginationOpts.numItems)
    const user = await getUser(ctx)

    if (!user) {
      return {
        page: [],
        isDone: true,
        continueCursor: '',
      }
    }

    return await ctx.db
      .query('posts')
      .withIndex('by_owner', (q) => q.eq('ownerId', user.authId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

// ============================================
// GET
// ============================================
// Returns a single post if the signed-in user owns it.

export const get = query({
  args: { id: v.id('posts') },
  handler: async (ctx, args) => {
    const user = await getUser(ctx)
    if (!user) return null

    const post = await ctx.db.get(args.id)
    if (!post || post.ownerId !== user.authId) {
      return null
    }

    return post
  },
})

// ============================================
// CREATE
// ============================================

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authorize(ctx, 'post.create')
    const title = normalizeTitle(args.title)
    const content = normalizeContent(args.content)

    return await ctx.db.insert('posts', {
      title,
      content,
      status: 'draft',
      ownerId: user.authId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

// ============================================
// UPDATE (owner only)
// ============================================

export const update = mutation({
  args: {
    id: v.id('posts'),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.id)
    if (!post) throw new ConvexError({ code: 'NOT_FOUND', message: 'Post not found' })

    await authorize(ctx, 'post.update', post)

    const updates: { title?: string; content?: string; updatedAt: number } = {
      updatedAt: Date.now(),
    }
    if (args.title !== undefined) updates.title = normalizeTitle(args.title)
    if (args.content !== undefined) updates.content = normalizeContent(args.content)

    await ctx.db.patch(args.id, updates)
  },
})

// ============================================
// DELETE (owner only)
// ============================================

export const remove = mutation({
  args: { id: v.id('posts') },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.id)
    if (!post) throw new ConvexError({ code: 'NOT_FOUND', message: 'Post not found' })

    await authorize(ctx, 'post.delete', post)

    await ctx.db.delete(args.id)
  },
})

// ============================================
// PUBLISH (owner only)
// ============================================

export const publish = mutation({
  args: { id: v.id('posts') },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.id)
    if (!post) throw new ConvexError({ code: 'NOT_FOUND', message: 'Post not found' })

    await authorize(ctx, 'post.publish', post)

    await ctx.db.patch(args.id, {
      status: 'published',
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
