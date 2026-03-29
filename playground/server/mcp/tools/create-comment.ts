import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'

import { api } from '../../../convex/_generated/api'
import { createCommentArgs, createCommentMeta } from '../../../shared/schemas/comment'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(createCommentArgs, createCommentMeta)

export default defineConvexTool({
  schema,
  name: 'create-comment',
  auth: 'required',
  require: 'comment.create',
  scoped: true,
  handler: async (args, _extra, ctx) => {
    const commentId = await ctx.mutation(api.comments.create, args)
    return withSummary(
      { id: commentId, postId: args.postId },
      `Added comment to post ${args.postId}`,
    )
  },
})
