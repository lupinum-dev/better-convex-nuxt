import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireDelegatedClientAccess, requireOrgMember } from './access'

export const linkClient = mutation({
  args: {
    agencyOrganizationId: v.id('organizations'),
    clientOrganizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, args.agencyOrganizationId, 'admin')
    const now = Date.now()
    return await ctx.db.insert('organizationLinks', {
      ...args,
      status: 'active',
      createdAt: now,
      updatedAt: now
    })
  }
})

export const revoke = mutation({
  args: {
    agencyOrganizationId: v.id('organizations'),
    clientOrganizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, args.agencyOrganizationId, 'admin')
    const link = await ctx.db
      .query('organizationLinks')
      .withIndex('by_agency_client', (q: any) =>
        q
          .eq('agencyOrganizationId', args.agencyOrganizationId)
          .eq('clientOrganizationId', args.clientOrganizationId)
      )
      .unique()

    if (link) {
      await ctx.db.patch(link._id, {
        status: 'revoked',
        updatedAt: Date.now()
      })
    }
  }
})

export const listClients = query({
  args: {
    agencyOrganizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, args.agencyOrganizationId)
    const links = await ctx.db
      .query('organizationLinks')
      .withIndex('by_agency', (q) => q.eq('agencyOrganizationId', args.agencyOrganizationId))
      .collect()

    const clients = []
    for (const link of links) {
      if (link.status !== 'active') continue
      const client = await ctx.db.get(link.clientOrganizationId)
      if (client) clients.push(client)
    }

    return clients
  }
})

export const assertClientAccess = query({
  args: {
    agencyOrganizationId: v.id('organizations'),
    clientOrganizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireDelegatedClientAccess(ctx, args)
    return true
  }
})
