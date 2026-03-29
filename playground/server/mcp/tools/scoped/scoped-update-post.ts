/**
 * MCP Tool: Update Post (Scoped — tenant isolation)
 *
 * Demonstrates scoped + permission + ownership checking.
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'
import { serverConvexMutation } from 'better-convex-nuxt/server'

import { api } from '../../../../convex/_generated/api'
import { updatePostArgs, updatePostMeta } from '../../../../shared/schemas/post'
import { defineConvexTool } from '../../utils/tools'

const schema = defineConvexSchema(updatePostArgs, updatePostMeta)

export default defineConvexTool({
  schema,
  name: 'scoped-update-post',
  auth: 'required',
  require: 'post.update',
  scoped: true,
  handler: async (args, _extra, ctx) => {
    await serverConvexMutation(api.posts.update, args)
    return withSummary(
      { id: args.id, orgId: ctx?.org.id },
      `Updated post ${args.id} in org ${ctx?.org.id}`,
    )
  },
})
