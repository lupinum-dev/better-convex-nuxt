import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'

import { api } from '../../../convex/_generated/api'
import { updatePostArgs, updatePostMeta } from '../../../shared/schemas/post'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(updatePostArgs, updatePostMeta)

export default defineConvexTool({
  schema,
  name: 'update-post',
  auth: 'required',
  require: 'post.update',
  scoped: true,
  handler: async (args, _extra, ctx) => {
    await ctx.mutation(api.posts.update, args)
    return withSummary({ id: args.id }, `Updated post ${args.id}`)
  },
})
