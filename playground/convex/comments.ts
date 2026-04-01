import { can, authorize, withTrustedCaller } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import type { Actor } from './auth/actor'
import { getActor } from './auth/actor'
import {
  canCreateComment,
  canDeleteComment,
  canReadComment,
  canUpdateComment,
} from './auth/checks'
import { withCan } from './auth/resource'
import { loadResource } from './auth/scope'
import {
  createComment,
  deleteComment,
  listCommentsByPost,
  updateComment,
} from '../shared/schemas/comment'

function attachCommentPermissions(
  actor: Exclude<Actor, null>,
  comment: { ownerId: string; [key: string]: unknown },
) {
  return withCan(comment, {
    'comment.update': can(actor, canUpdateComment(comment)),
    'comment.delete': can(actor, canDeleteComment(comment)),
  })
}

export const listByPost = query({
  args: withTrustedCaller(listCommentsByPost.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    if (!actor) return []

    authorize(actor, 'Read comments', canReadComment)

    const post = loadResource(actor, await ctx.db.get(args.postId), 'Post')
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_post', q => q.eq('postId', post._id))
      .order('desc')
      .collect()

    return comments.map(comment => attachCommentPermissions(actor, comment))
  },
})

export const create = mutation({
  args: withTrustedCaller(createComment.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Create comment', canCreateComment)
    const post = loadResource(actor, await ctx.db.get(args.postId), 'Post')

    return await ctx.db.insert('comments', {
      postId: args.postId,
      content: args.content,
      ownerId: actor.userId,
      organizationId: post.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: withTrustedCaller(updateComment.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    const comment = loadResource(actor, await ctx.db.get(args.id), 'Comment')
    authorize(actor, 'Update comment', canUpdateComment(comment))

    await ctx.db.patch(args.id, {
      content: args.content,
      editedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: withTrustedCaller(deleteComment.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    const comment = loadResource(actor, await ctx.db.get(args.id), 'Comment')
    authorize(actor, 'Delete comment', canDeleteComment(comment))
    await ctx.db.delete(args.id)
  },
})
