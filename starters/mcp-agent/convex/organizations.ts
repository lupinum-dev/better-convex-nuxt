import { v } from 'convex/values'

import { createOrganizationInputSchema } from '../shared/inputSchemas'
import { mutation, query } from './_generated/server'
import { requireOrganizationMembership } from './access'
import { requireCurrentUser } from './users'
import { parseWithConvexError } from './validation'

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { name } = parseWithConvexError(createOrganizationInputSchema, args)

    const user = await requireCurrentUser(ctx)
    const now = Date.now()
    const organizationId = await ctx.db.insert('organizations', {
      name,
      createdBy: user._id,
      createdAt: now,
    })

    await ctx.db.insert('memberships', {
      organizationId,
      userId: user._id,
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    return organizationId
  },
})

export const get = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await requireOrganizationMembership(ctx, args.organizationId)
    return await ctx.db.get(args.organizationId)
  },
})

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect()

    const rows = await Promise.all(
      memberships
        .filter((membership) => membership.status === 'active')
        .map(async (membership) => {
          const organization = await ctx.db.get(membership.organizationId)
          if (!organization) return null

          return {
            id: organization._id,
            name: organization.name,
            role: membership.role,
            createdAt: organization.createdAt,
          }
        }),
    )

    return rows.filter((row): row is NonNullable<typeof row> => row !== null)
  },
})
