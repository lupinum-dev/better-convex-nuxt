import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { listCommentsByPost } from '../../../shared/schemas/comment'

export default defineTool({
  schema: listCommentsByPost,
  name: 'list-comments',
  operation: 'query',
  auth: 'required',
  require: 'comment.read',
  scoped: true,
  handler: async (args, ctx) => {
    const comments = await ctx.query(api.comments.listByPost, args)
    return ctx.ok(
      { postId: args.postId, count: comments.length, comments },
      `Found ${comments.length} comment${comments.length === 1 ? '' : 's'}`,
    )
  },
})
