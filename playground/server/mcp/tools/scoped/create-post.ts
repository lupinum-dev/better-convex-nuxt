/**
 * MCP Tool: Create Post (Scoped — tenant isolation)
 *
 * Demonstrates scoped + permission + rate limiting together.
 * The org context is resolved from the MCP auth token.
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'
import { serverConvexMutation } from 'better-convex-nuxt/server'

import { api } from '../../../../convex/_generated/api'
import { createPostArgs, createPostMeta } from '../../../../shared/schemas/post'
import { defineConvexTool } from '../../utils/tools'

const schema = defineConvexSchema(createPostArgs, createPostMeta)

export default defineConvexTool({
  schema,
  name: 'scoped-create-post',
  auth: 'required',
  require: 'post.create',
  scoped: true,
  rateLimit: { max: 10, window: '1m' },
  handler: async (args, _extra, ctx) => {
    const postId = await serverConvexMutation(api.posts.create, args)
    return withSummary(
      { id: postId, title: args.title, orgId: ctx?.org.id },
      `Created post "${args.title}" in org ${ctx?.org.id}`,
    )
  },
})
