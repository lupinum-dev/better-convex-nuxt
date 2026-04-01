import { enforce } from 'better-convex-nuxt/auth'
import { withTrustedCaller, withTrustedCallerHandler } from 'better-convex-nuxt/trusted-caller'

import { createComment } from '../shared/schemas/comment'
import { mutation } from './_generated/server'
import { getActor } from './auth/actor'
import { canCreateComment } from './auth/checks'
import { loadResource } from './auth/scope'

export const create = mutation({
  args: withTrustedCaller(createComment.args),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
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
  }),
})
