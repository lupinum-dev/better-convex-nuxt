import { defineTool } from '#convex/mcp'
import { defineSchema } from 'better-convex-nuxt/schema'

import { api } from '../../../convex/_generated/api'

const schema = defineSchema({
  description: 'List all posts in the current organization',
  args: {},
})

export default defineTool({
  schema,
  name: 'list-posts',
  operation: 'query',
  auth: 'required',
  scoped: true,
  handler: async (_args, _extra, ctx) => {
    const posts = await ctx.query(api.posts.list)
    return ctx.ok(
      { count: posts.length, posts },
      `Found ${posts.length} post${posts.length === 1 ? '' : 's'}`,
    )
  },
})
