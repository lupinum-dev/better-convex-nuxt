import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { createPost } from '../../../shared/schemas/post'

export default defineTool({
  schema: createPost,
  name: 'create-post',
  auth: 'required',
  check: actor => ['owner', 'admin', 'member'].includes(actor.role),
  scoped: true,
  rateLimit: { max: 10, window: '1m' },
  handler: async (args, ctx) => {
    const postId = await ctx.mutation(api.posts.create, args)
    return ctx.ok({ id: postId }, `Created post "${args.title}"`)
  },
})
