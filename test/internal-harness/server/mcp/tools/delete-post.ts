import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { deletePost } from '../../../shared/schemas/post'
import { toHarnessMcpPrincipal } from '../../support/mcp-principal'

export default defineTool({
  schema: deletePost,
  name: 'delete-post',
  auth: 'required',
  check: (actor) => ['owner', 'admin', 'member'].includes(actor.role),
  scoped: true,
  destructive: true,
  preview: async (args, ctx) => {
    const post = await ctx.rawQuery(api.posts.get, {
      id: args.id,
      principal: toHarnessMcpPrincipal(ctx),
    })
    if (!post) {
      return {
        summary: 'Post not found',
        blocked: true,
      }
    }
    return {
      summary: `Will permanently delete "${post.title}"`,
      warn: 'This cannot be undone',
      affects: { posts: 1 },
    }
  },
  handler: async (args, ctx) => {
    await ctx.rawMutation(api.posts.remove, {
      ...args,
      principal: toHarnessMcpPrincipal(ctx),
    })
    return ctx.ok({ deleted: true, id: args.id })
  },
})
