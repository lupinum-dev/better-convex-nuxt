import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
import { requireOrganizationActivityAccess, requireProjectTeamAccess } from './lib/authz'

export const listForOrganization = query({
  args: {
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireOrganizationActivityAccess(ctx, {
      organizationId: args.organizationId,
    })

    return await ctx.db
      .query('auditEvents')
      .withIndex('by_organizationId_createdAt', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const listForTeam = query({
  args: {
    teamId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const access = await requireProjectTeamAccess(ctx, {
      teamId: args.teamId,
      permission: 'read',
    })

    return await ctx.db
      .query('auditEvents')
      .withIndex('by_organizationId_teamId_createdAt', (q) =>
        q.eq('organizationId', access.organizationId).eq('teamId', args.teamId),
      )
      .order('desc')
      .paginate(args.paginationOpts)
  },
})
