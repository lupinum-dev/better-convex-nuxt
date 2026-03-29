/**
 * MCP Tool: List Posts (Scoped — tenant isolation)
 *
 * Uses scoped: true to enforce org isolation at the MCP layer.
 * The Convex function (tenant-posts.list) also enforces isolation server-side,
 * making this defense-in-depth.
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexQuery } from 'better-convex-nuxt/server'

import { api } from '../../../../convex/_generated/api'
import { defineConvexTool } from '../../utils/tools'

const schema = defineConvexSchema(
  {},
  { description: 'List all posts in the current organization' },
)

export default defineConvexTool({
  schema,
  name: 'scoped-list-posts',
  operation: 'query',
  auth: 'required',
  scoped: true,
  handler: async (_args, _extra, ctx) => {
    const posts = await serverConvexQuery(api.posts.list, {})
    // ctx?.org.owns() provides MCP-layer org filtering
    // But the Convex function already scopes by org via scopedQuery
    return {
      orgId: ctx?.org.id,
      count: posts.length,
      posts: posts.map((p: Record<string, unknown>) => ({
        id: p._id,
        title: p.title,
        status: p.status,
        ownerId: p.ownerId,
      })),
    }
  },
})
