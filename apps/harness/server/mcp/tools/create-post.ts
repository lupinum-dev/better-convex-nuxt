import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { createPost } from '../../../shared/schemas/post'
import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'
import { toHarnessMcpPrincipal } from '../../support/mcp-principal'

export default defineTool({
  schema: createPost,
  name: 'create-post',
  auth: 'required',
  check: (actor) => ['owner', 'admin', 'member'].includes(actor.role),
  scoped: true,
  rateLimit: { max: 10, window: '1m' },
  enabled: async (event) => {
    const auth = await resolveHarnessMcpAuth(event)
    return !!auth?.tenantId
  },
  resolveAuth: resolveHarnessMcpAuth,
  resolvePrincipal: ({ actor }) =>
    toHarnessMcpPrincipal({
      actor,
    }),
  handler: async (args, ctx) => {
    const postId = await ctx.mutation(api.posts.create, args)
    return ctx.ok({ id: postId }, `Created post "${args.title}"`)
  },
})
