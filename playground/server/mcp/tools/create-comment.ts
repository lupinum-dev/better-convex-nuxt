import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { createComment } from '../../../shared/schemas/comment'

export default defineTool({
  schema: createComment,
  name: 'create-comment',
  auth: 'required',
  require: 'comment.create',
  scoped: true,
  handler: async (args, _extra, ctx) => {
    const commentId = await ctx.mutation(api.comments.create, args)
    return ctx.ok(
      { id: commentId, postId: args.postId },
      `Added comment to post ${args.postId}`,
    )
  },
})
