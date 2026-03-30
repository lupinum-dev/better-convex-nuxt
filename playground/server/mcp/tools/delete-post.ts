import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { deletePost } from '../../../shared/schemas/post'

export default defineTool({
  schema: deletePost,
  name: 'delete-post',
  auth: 'required',
  check: actor => ['owner', 'admin', 'member'].includes(actor.role),
  scoped: true,
  destructive: true,
  preview: async (args, ctx) => {
    const post = await ctx.query(api.posts.get, { id: args.id })
    if (!post) return ctx.blocked('Post not found')
    return ctx.preview({
      summary: `Will permanently delete "${post.title}"`,
      warn: 'This cannot be undone',
      affects: { posts: 1 },
    })
  },
  handler: async (args, ctx) => {
    await ctx.mutation(api.posts.remove, args)
    return ctx.ok({ deleted: true, id: args.id })
  },
})
