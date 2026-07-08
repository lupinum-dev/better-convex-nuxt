import { v } from 'convex/values'

import { query } from './_generated/server'
import { requireOrgAccess } from './access'

export const list = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.organizationId)
    return await ctx.db
      .query('domainRecords')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .collect()
  },
})
