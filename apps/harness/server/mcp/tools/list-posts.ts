import { defineArgs } from '@lupinum/trellis/args'

import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'

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
  enabled: async (event) => {
    const auth = await resolveHarnessMcpAuth(event)
    return !!auth?.tenantId
  },
  resolveAuth: resolveHarnessMcpAuth,
  handler: async (_args, ctx) => {
    const posts = await ctx.query(api.posts.list, {})
    const items = posts.map((post) => ({
      id: String(post._id),
      title: String(post.title),
      content: String(post.content),
      status: String(post.status),
      ownerId: post.ownerId,
      organizationId: String(post.organizationId),
      publishedAt: typeof post.publishedAt === 'number' ? post.publishedAt : null,
      createdAt: Number(post.createdAt),
      updatedAt: Number(post.updatedAt),
      capabilities: post._can,
    }))

    return ctx.ok(
      { count: items.length, posts: items },
      `Found ${posts.length} post${posts.length === 1 ? '' : 's'}`,
    )
  },
})
