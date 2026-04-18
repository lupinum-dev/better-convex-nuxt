/**
 * Why this file exists:
 * The MCP demo middleware resolves `Bearer demo:<email>` into a real app user by calling this query.
 * That keeps the example's MCP auth setup tiny while still forwarding only transport identity into Convex.
 */
import { open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { mutation, query } from '../functions'

export const resolveMcpUserByEmail = query({
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
      userId: user.authId,
    }
  },
})
