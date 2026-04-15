import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { createComment } from '../../../shared/schemas/comment'
import { toHarnessMcpPrincipal } from '../../support/mcp-principal'

export default defineTool({
  schema: createComment,
  name: 'create-comment',
  auth: 'required',
  check: (actor) => ['owner', 'admin', 'member', 'viewer'].includes(actor.role),
  scoped: true,
  handler: async (args, ctx) => {
    const commentId = await ctx.rawMutation(api.comments.create, {
      ...args,
      principal: toHarnessMcpPrincipal(ctx),
    })
    return ctx.ok({ id: commentId, postId: args.postId }, `Added comment to post ${args.postId}`)
  },
})
