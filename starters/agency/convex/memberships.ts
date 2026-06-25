import { v } from 'convex/values'

import { query } from './_generated/server'
import { requireOrgMember } from './access'

export const list = query({
  args: {
    organizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, args.organizationId, 'member')
    return await ctx.db
      .query('memberships')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .collect()
  }
})

