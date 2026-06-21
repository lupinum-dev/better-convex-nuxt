import { v } from 'convex/values'

import { query } from './_generated/server'
import { requireCurrentUser } from './users'

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    return await ctx.db
      .query('memberships')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect()
  }
})

export const listForOrganization = query({
  args: {
    organizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('memberships')
      .withIndex('by_org_user', (q) => q.eq('organizationId', args.organizationId))
      .collect()
  }
})

