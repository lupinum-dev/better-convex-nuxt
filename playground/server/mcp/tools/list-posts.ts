import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'

import { api } from '../../../convex/_generated/api'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema({}, { description: 'List all posts in the current organization' })

export default defineConvexTool({
  schema,
  name: 'list-posts',
  operation: 'query',
  auth: 'required',
  scoped: true,
  handler: async (_args, _extra, ctx) => {
    const posts = await ctx.query(api.posts.list)
    return withSummary(
      { count: posts.length, posts },
      `Found ${posts.length} post${posts.length === 1 ? '' : 's'}`,
    )
  },
})
