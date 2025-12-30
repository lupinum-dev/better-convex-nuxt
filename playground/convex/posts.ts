/**
 * Posts Module
 *
 * CRUD operations with full permission checks.
 * Demonstrates the permission system in action.
 */

import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import { getUser, authorize, requireSameOrg } from './lib/permissions'

// ============================================
// LIST
// ============================================
// Returns all posts in the user's organization.

export const list = query({
  args: {},
  handler: async (ctx) => {
    // Get current user (null if not logged in)
    const user = await getUser(ctx)
    if (!user) return []

    // Fetch posts scoped to user's org
    // This IS the "read" permission - org isolation
    return await ctx.db
      .query('posts')
      .withIndex('by_organization', (q) => q.eq('organizationId', user.organizationId))
      .order('desc')
      .collect()
  },
})

// ============================================
// LIST PAGINATED (auth-protected)
// ============================================
// Returns paginated posts in the user's organization.
// Requires authentication - used to test SSR with auth.

export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    // Get current user (null if not logged in)
    const user = await getUser(ctx)

    // If not logged in, return empty result
    if (!user) {
      return {
        page: [],
        isDone: true,
        continueCursor: '',
      }
    }

    // Fetch paginated posts scoped to user's org
    return await ctx.db
      .query('posts')
      .withIndex('by_organization', (q) => q.eq('organizationId', user.organizationId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

// ============================================
// GET
// ============================================
// Returns a single post if user can access it.

export const get = query({
  args: { id: v.id('posts') },
  handler: async (ctx, args) => {
    const user = await getUser(ctx)
    const post = await ctx.db.get(args.id)

    // Org isolation: only return if same org
    if (!requireSameOrg(user, post)) {
      return null
    }

    return post
  },
})

// ============================================
// CREATE
// ============================================
// Creates a new post. User must have post.create permission.

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // authorize() does:
    // 1. Checks user is logged in
    // 2. Checks post.create permission
    // 3. Returns user so we can use it
    const user = await authorize(ctx, 'post.create')

    return await ctx.db.insert('posts', {
      title: args.title,
      content: args.content,
      status: 'draft',
      ownerId: user.authId,
      organizationId: user.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

// ============================================
// UPDATE
// ============================================
// Updates a post. Checks ownership for members.

export const update = mutation({
  args: {
    id: v.id('posts'),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get post first (need it for ownership check)
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found')

    // authorize() with resource checks:
    // - Org isolation (post must be in user's org)
    // - Permission (post.update)
    // - Ownership (if permission uses "own")
    await authorize(ctx, 'post.update', post)

    await ctx.db.patch(args.id, {
      ...(args.title && { title: args.title }),
      ...(args.content && { content: args.content }),
      updatedAt: Date.now(),
    })
  },
})

// ============================================
// DELETE
// ============================================

export const remove = mutation({
  args: { id: v.id('posts') },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found')

    await authorize(ctx, 'post.delete', post)

    await ctx.db.delete(args.id)
  },
})

// ============================================
// PUBLISH (admin only)
// ============================================

export const publish = mutation({
  args: { id: v.id('posts') },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found')

    // post.publish = { roles: ["owner", "admin"] }
    // No "own" option, so members can NEVER publish
    await authorize(ctx, 'post.publish', post)

    await ctx.db.patch(args.id, {
      status: 'published',
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
