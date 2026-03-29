/**
 * MCP Tool: Create Comment (Scoped)
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'
import { serverConvexMutation } from 'better-convex-nuxt/server'

import { api } from '../../../../convex/_generated/api'
import { createCommentArgs, createCommentMeta } from '../../../../shared/schemas/comment'
import { defineConvexTool } from '../../utils/tools'

const schema = defineConvexSchema(createCommentArgs, createCommentMeta)

export default defineConvexTool({
  schema,
  name: 'scoped-create-comment',
  auth: 'required',
  require: 'comment.create',
  scoped: true,
  handler: async (args, _extra, ctx) => {
    const commentId = await serverConvexMutation(api.posts.create, {
      title: `Comment on ${args.postId}`,
      content: args.content,
    })
    return withSummary(
      { id: commentId, postId: args.postId, orgId: ctx?.org.id },
      `Added comment to post ${args.postId}`,
    )
  },
})
