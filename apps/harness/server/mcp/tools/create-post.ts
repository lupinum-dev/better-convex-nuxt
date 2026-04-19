import { createServerConvexCaller } from '@lupinum/trellis/server'

import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { createPost } from '../../../shared/schemas/post'
import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'

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
  handler: async (args, ctx) => {
    if (!ctx.actor) {
      return ctx.error('auth', 'Authentication required.')
    }

    const convex = createServerConvexCaller(ctx.event, {
      auth: 'trusted',
      actor: { userId: ctx.actor.userId },
      principal: {
        kind: 'agent',
        provider: 'mcp',
        role: ctx.actor.role,
        userId: ctx.actor.userId,
        ...(ctx.actor.tenantId ? { tenantId: ctx.actor.tenantId } : {}),
      },
    })
    const postId = await convex.mutation(api.posts.create, args)
    return ctx.ok({ id: postId }, `Created post "${args.title}"`)
  },
})
