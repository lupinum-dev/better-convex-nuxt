import { query, mutation } from './_generated/server'
import {
  requireActor,
  serviceAuthArgs,
} from './lib/actor'
import { assertPermission } from './lib/access'
import { scoped } from './lib/scoped'
import {
  createCommentArgs,
  updateCommentArgs,
  deleteCommentArgs,
  listCommentsByPostArgs,
} from '../shared/schemas/comment'

export const listByPost = query({
  args: { ...listCommentsByPostArgs, ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const s = await scoped.try(ctx, args)
    if (!s) return []

    const post = await s.db.get(args.postId)
    if (!post) return []

    return await s.db
      .query('comments')
      .filter((q) => q.eq(q.field('postId'), args.postId))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: { ...createCommentArgs, ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const { db, actor } = await scoped(ctx, args)
    assertPermission(actor, 'comment.create')

    const post = await db.get(args.postId)
    if (!post) throw new Error('Post not found')

    return await db.insert('comments', {
      postId: args.postId,
      content: args.content,
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: { ...updateCommentArgs, ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    const comment = await ctx.db.get(args.id)
    if (!comment) throw new Error('Comment not found')
    if (comment.organizationId !== actor.orgId) throw new Error('Forbidden: comment.update')

    assertPermission(actor, 'comment.update', comment)

    await ctx.db.patch(args.id, {
      content: args.content,
      editedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: { ...deleteCommentArgs, ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    const comment = await ctx.db.get(args.id)
    if (!comment) throw new Error('Comment not found')
    if (comment.organizationId !== actor.orgId) throw new Error('Forbidden: comment.delete')

    assertPermission(actor, 'comment.delete', comment)
    await ctx.db.delete(args.id)
  },
})
