import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'

import { api } from '../../../convex/_generated/api'
import { listCommentsByPostArgs, listCommentsByPostMeta } from '../../../shared/schemas/comment'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(listCommentsByPostArgs, listCommentsByPostMeta)

export default defineConvexTool({
  schema,
  name: 'list-comments',
  operation: 'query',
  auth: 'required',
  require: 'comment.read',
  scoped: true,
  handler: async (args, _extra, ctx) => {
    const comments = await ctx.query(api.comments.listByPost, args)
    return withSummary(
      { postId: args.postId, count: comments.length, comments },
      `Found ${comments.length} comment${comments.length === 1 ? '' : 's'}`,
    )
  },
})
