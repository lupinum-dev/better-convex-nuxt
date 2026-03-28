/**
 * MCP Tool: Update Post (middleware example)
 *
 * Demonstrates: middleware with ctx.can() for fine-grained control,
 * maxItems (not applicable here, just typed permissions + auth).
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexMutation } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { updatePostArgs, updatePostMeta } from '../../../shared/schemas/post'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(updatePostArgs, updatePostMeta)

export default defineConvexTool({
  schema,
  name: 'update-post',
  auth: 'required',
  require: 'post.update',
  handler: async (args) => {
    await serverConvexMutation(api.posts.update, args)
    return { updated: true, id: args.id }
  },
})
