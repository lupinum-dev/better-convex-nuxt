import { defineConvexMcpTool } from 'better-convex-nuxt/mcp'
/**
 * MCP Tool: Create Post
 *
 * Uses the shared Convex schema directly so validators, metadata,
 * and handler args stay aligned with the Convex mutation.
 *
 * Requires authentication — posts.create checks permissions.
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexMutation } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { createPostArgs, createPostMeta } from '../../../shared/schemas/post'

const schema = defineConvexSchema(createPostArgs, createPostMeta)

export default defineConvexMcpTool({
  schema,
  handler: async (args) => {
    const result = await serverConvexMutation(api.posts.create, args)
    return `Post created with ID: ${result}`
  },
})
