import { v } from 'convex/values'

import { query } from './_generated/server'
import { requireOrganizationAdmin } from './access'

export const listForOrganization = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await requireOrganizationAdmin(ctx, args.organizationId)
    return await ctx.db
      .query('memberships')
      .withIndex('by_org_user', (q) => q.eq('organizationId', args.organizationId))
      .take(100)
  },
})
