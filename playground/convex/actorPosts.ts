/**
 * Actor-based Posts
 *
 * Same CRUD as posts.ts and tenantPosts.ts but using the new actor primitives.
 * Demonstrates scoped(ctx, args) and scoped.try(ctx, args) patterns.
 */

import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import { serviceAuthArgs, cleanArgs, scoped, requireActor } from './lib/actor'
import { createPostArgs, updatePostArgs } from '../shared/schemas/post'

// ── Simple CRUD (scoped db) ─────────────────────────

export const list = query({
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const s = await scoped.try(ctx, args)
    if (!s) return []
    return await s.db.query('posts').order('desc').collect()
  },
})

export const get = query({
  args: { id: v.id('posts'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const s = await scoped.try(ctx, args)
    if (!s) return null
    return await s.db.get(args.id)
  },
})

export const create = mutation({
  args: { ...createPostArgs, ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const { db, actor } = await scoped(ctx, args)
    return await db.insert('posts', {
      ...cleanArgs(args),
      status: 'draft',
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: { ...updatePostArgs, ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const { db } = await scoped(ctx, args)
    await db.patch(args.id, {
      ...(args.title !== undefined && { title: args.title }),
      ...(args.content !== undefined && { content: args.content }),
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: { id: v.id('posts'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const { db } = await scoped(ctx, args)
    await db.delete(args.id)
  },
})

// ── Escape hatch (raw db) ───────────────────────────

export const rawCount = query({
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const { raw } = await scoped(ctx, args)
    const allPosts = await raw.db.query('posts' as any).collect()
    return allPosts.length
  },
})
