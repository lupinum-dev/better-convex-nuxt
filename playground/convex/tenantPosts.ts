/**
 * Tenant-Scoped Posts
 *
 * Same CRUD as posts.ts but using scopedQuery/scopedMutation.
 * Used by tenant integration tests to verify isolation.
 */

import { v } from 'convex/values'

import { scopedQuery, scopedMutation } from './lib/tenant'

export const list = scopedQuery({
  args: {},
  handler: async (db) => {
    return await db.query('posts').order('desc').collect()
  },
})

export const get = scopedQuery({
  args: { id: v.id('posts') },
  handler: async (db, args) => {
    return await db.get(args.id)
  },
})

export const create = scopedMutation({
  args: {
    title: v.string(),
    content: v.string(),
  },
  permission: 'post.create',
  handler: async (db, args, { user }) => {
    return await db.insert('posts', {
      title: args.title,
      content: args.content,
      status: 'draft',
      ownerId: user.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const update = scopedMutation({
  args: {
    id: v.id('posts'),
    title: v.optional(v.string()),
  },
  permission: 'post.update',
  resource: async (db, args) => {
    const post = await db.get(args.id)
    return post as Record<string, unknown> & { ownerId?: string } | null
  },
  handler: async (db, args) => {
    await db.patch(args.id, {
      ...(args.title && { title: args.title }),
      updatedAt: Date.now(),
    })
  },
})

export const remove = scopedMutation({
  args: { id: v.id('posts') },
  permission: 'post.delete',
  resource: async (db, args) => {
    const post = await db.get(args.id)
    return post as Record<string, unknown> & { ownerId?: string } | null
  },
  handler: async (db, args) => {
    await db.delete(args.id)
  },
})

// Escape hatch example
export const rawCount = scopedQuery({
  args: {},
  handler: async (_db, _args, tenant) => {
    // Use raw db to count ALL posts across all orgs (admin view)
    const allPosts = await tenant.raw.db.query('posts').collect()
    return allPosts.length
  },
})
