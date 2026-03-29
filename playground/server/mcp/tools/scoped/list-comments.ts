/**
 * MCP Tool: List Comments by Post (Scoped)
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexQuery } from 'better-convex-nuxt/server'

import { api } from '../../../../convex/_generated/api'
import { listCommentsByPostArgs, listCommentsByPostMeta } from '../../../../shared/schemas/comment'
import { defineConvexTool } from '../../utils/tools'

const schema = defineConvexSchema(listCommentsByPostArgs, listCommentsByPostMeta)

export default defineConvexTool({
  schema,
  name: 'scoped-list-comments',
  operation: 'query',
  auth: 'required',
  require: 'comment.read',
  scoped: true,
  handler: async (args) => {
    const comments = await serverConvexQuery(api.posts.get, { id: args.postId })
    if (!comments) return { error: 'Post not found' }
    // Note: in production you'd call a dedicated listByPost query
    return { postId: args.postId, comments }
  },
})
