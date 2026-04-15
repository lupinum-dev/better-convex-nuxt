import { defineArgs } from '@lupinum/trellis/args'

import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { toHarnessMcpPrincipal } from '../../support/mcp-principal'

const schema = defineArgs({
  description: 'List all posts in the current organization',
  args: {},
})

export default defineTool({
  schema,
  name: 'list-posts',
  operation: 'query',
  auth: 'required',
  scoped: true,
  handler: async (_args, ctx) => {
    const posts = await ctx.rawQuery(api.posts.list, {
      principal: toHarnessMcpPrincipal(ctx),
    })
    return ctx.ok(
      { count: posts.length, posts },
      `Found ${posts.length} post${posts.length === 1 ? '' : 's'}`,
    )
  },
})
