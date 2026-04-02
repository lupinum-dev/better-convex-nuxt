import { createComment } from '../shared/schemas/comment'
import { canCreateComment } from './auth/checks'
import { loadResource } from './auth/scope'
import { app } from './functions'

export const create = app.mutation({
  args: createComment.args,
  guard: canCreateComment,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
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
