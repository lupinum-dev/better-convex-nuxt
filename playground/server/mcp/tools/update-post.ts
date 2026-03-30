import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { updatePost } from '../../../shared/schemas/post'

export default defineTool({
  schema: updatePost,
  name: 'update-post',
  auth: 'required',
  require: 'post.update',
  scoped: true,
  handler: async (args, ctx) => {
    await ctx.mutation(api.posts.update, args)
    return ctx.ok({ id: args.id }, `Updated post ${args.id}`)
  },
})
