import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { createPost } from '../../../shared/schemas/post'
import { toHarnessMcpPrincipal } from '../../support/mcp-principal'

export default defineTool({
  schema: createPost,
  name: 'create-post',
  auth: 'required',
  check: (actor) => ['owner', 'admin', 'member'].includes(actor.role),
  scoped: true,
  rateLimit: { max: 10, window: '1m' },
  handler: async (args, ctx) => {
    const postId = await ctx.rawMutation(api.posts.create, {
      ...args,
      principal: toHarnessMcpPrincipal(ctx),
    })
    return ctx.ok({ id: postId }, `Created post "${args.title}"`)
  },
})
