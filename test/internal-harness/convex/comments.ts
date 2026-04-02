import { enforce } from 'better-convex-nuxt/auth'

import { createComment } from '../shared/schemas/comment'
import { canCreateComment } from './auth/checks'
import { loadResource } from './auth/scope'
import { appMutation } from './functions'

export const create = appMutation({
  args: createComment.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Create comment', canCreateComment)
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
