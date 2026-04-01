import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { createComment } from '../../../shared/schemas/comment'

export default defineTool({
  schema: createComment,
  name: 'create-comment',
  auth: 'required',
  check: (actor) => ['owner', 'admin', 'member', 'viewer'].includes(actor.role),
  scoped: true,
  handler: async (args, ctx) => {
    const commentId = await ctx.mutation(api.comments.create, args)
    return ctx.ok({ id: commentId, postId: args.postId }, `Added comment to post ${args.postId}`)
  },
})
