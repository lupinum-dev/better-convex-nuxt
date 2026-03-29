import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'

import { api } from '../../../convex/_generated/api'
import { createPostArgs, createPostMeta } from '../../../shared/schemas/post'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(createPostArgs, createPostMeta)

export default defineConvexTool({
  schema,
  name: 'create-post',
  auth: 'required',
  require: 'post.create',
  scoped: true,
  rateLimit: { max: 10, window: '1m' },
  handler: async (args, _extra, ctx) => {
    const postId = await ctx.mutation(api.posts.create, args)
    return withSummary({ id: postId }, `Created post "${args.title}"`)
  },
})
