/**
 * Why this file exists:
 * The MCP demo middleware resolves `Bearer demo:<email>` into a real actor by calling this query.
 * That keeps the example's MCP auth setup tiny while still exercising the real permission pipeline.
 */
import { v } from 'convex/values'

import { publicQuery } from './functions'

export const resolveMcpActorByEmail = publicQuery({
  args: {
    email: v.string(),
  },
  handler: async ({ db }, args) => {
    const user = await db
      .query('users')
      .withIndex('by_email', q => q.eq('email', args.email))
      .first()

    if (!user || !user.organizationId) {
      return null
    }

    return {
      role: user.role,
      userId: user.authId,
      tenantId: user.organizationId,
    }
  },
})
