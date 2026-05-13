import { defineArgs } from '@lupinum/trellis/args'

import { api } from '../../../convex/_generated/api'
import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'
import { tool } from '../runtime'

const harnessApi = api as any
type HarnessPost = {
  _id: unknown
  title: unknown
  content: unknown
  status: unknown
  ownerId: unknown
  organizationId: unknown
  publishedAt?: unknown
  createdAt: unknown
  updatedAt: unknown
  _can: unknown
}

const schema = defineArgs({
  description: 'List all posts in the current organization',
  args: {},
})

export default tool.query({
  schema,
  call: harnessApi.posts.list,
  enabled: async (ctx) => {
    const auth = await resolveHarnessMcpAuth(ctx.event)
    return !!auth?.workspaceId
  },
  meta: {
    name: 'list-posts',
  },
  mapResult: ({ result }) => {
    const posts = result as HarnessPost[]
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
      recordAccess: post._can,
    }))

    return { count: items.length, posts: items }
  },
  summary: ({ result }) => {
    const posts = result as HarnessPost[]
    return `Found ${posts.length} post${posts.length === 1 ? '' : 's'}`
  },
})
