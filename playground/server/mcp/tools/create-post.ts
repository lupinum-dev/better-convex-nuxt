/**
 * MCP Tool: Create Post (Level 2 — auth + typed permissions)
 *
 * Uses the factory-created defineConvexTool for typed `require` autocomplete.
 * Demonstrates: auth: 'required', require: 'post.create', rate limiting.
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'
import { serverConvexMutation } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { createPostArgs, createPostMeta } from '../../../shared/schemas/post'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(createPostArgs, createPostMeta)

export default defineConvexTool({
  schema,
  name: 'create-post',
  auth: 'required',
  require: 'post.create',
  rateLimit: { max: 10, window: '1m' },
  handler: async (args) => {
    const postId = await serverConvexMutation(api.posts.create, args)
    return withSummary({ id: postId, title: args.title }, `Created post "${args.title}"`)
  },
})
