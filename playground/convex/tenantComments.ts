/**
 * Tenant-Scoped Comments
 *
 * CRUD for comments using scopedQuery/scopedMutation.
 * Comments are nested under posts and scoped to organizations.
 */

import { v } from 'convex/values'

import { scopedQuery, scopedMutation } from './lib/tenant'

export const listByPost = scopedQuery({
  args: { postId: v.id('posts') },
  handler: async (db, args) => {
    // First verify the post exists and belongs to this org
    const post = await db.get(args.postId)
    if (!post) return []

    return await db.query('comments').order('desc').collect()
  },
})

export const create = scopedMutation({
  args: {
    postId: v.id('posts'),
    content: v.string(),
  },
  permission: 'comment.create',
  handler: async (db, args, { user }) => {
    // Verify the post exists in this org
    const post = await db.get(args.postId)
    if (!post) throw new Error('Post not found')

    return await db.insert('comments', {
      postId: args.postId,
      content: args.content,
      ownerId: user.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const update = scopedMutation({
  args: {
    id: v.id('comments'),
    content: v.string(),
  },
  permission: 'comment.update',
  resource: async (db, args) => {
    const comment = await db.get(args.id)
    return comment as Record<string, unknown> & { ownerId?: string } | null
  },
  handler: async (db, args) => {
    await db.patch(args.id, {
      content: args.content,
      editedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const remove = scopedMutation({
  args: { id: v.id('comments') },
  permission: 'comment.delete',
  resource: async (db, args) => {
    const comment = await db.get(args.id)
    return comment as Record<string, unknown> & { ownerId?: string } | null
  },
  handler: async (db, args) => {
    await db.delete(args.id)
  },
})
