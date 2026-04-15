import { defineGuard } from '@lupinum/trellis/auth'

import { createComment } from '../shared/schemas/comment'
import type { Actor } from './auth/actor'
import { canCreateComment } from './auth/checks'
import { loadResource } from './auth/scope'
import { app } from './functions'

const canCreateScopedComment = defineGuard<Actor>(
  'comment.create',
  (actor) => !!actor?.tenantId && canCreateComment(actor),
)

export const create = app.mutation({
  args: createComment.args,
  guard: canCreateScopedComment,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor.tenantId) throw new Error('No organization selected')
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
