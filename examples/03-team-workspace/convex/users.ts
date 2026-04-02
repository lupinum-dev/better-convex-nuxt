/**
 * Why this file exists:
 * The MCP demo middleware resolves `Bearer demo:<email>` into a real actor by calling this query.
 * That keeps the example's MCP auth setup tiny while still exercising the real permission pipeline.
 */
import { open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { app } from './functions'

export const resolveMcpActorByEmail = app.query({
  guard: open,
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first()

    if (!user || !user.workspaceId) {
      return null
    }

    return {
      role: user.role,
      userId: user.authId,
      tenantId: user.workspaceId,
    }
  },
})
