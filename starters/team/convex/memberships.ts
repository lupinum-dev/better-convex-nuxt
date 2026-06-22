import { ConvexError, v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { requireOrgAccess } from './access'
import { writeAuditEvent } from './audit'
import { roleValidator } from './schema'

async function ensureNotLastOwner(ctx: MutationCtx, organizationId: Id<'organizations'>) {
  const activeOwners = await ctx.db
    .query('memberships')
    .withIndex('by_org_role_status', (q) =>
      q.eq('organizationId', organizationId).eq('role', 'owner').eq('status', 'active'),
    )
    .take(2)

  if (activeOwners.length <= 1) {
    throw new ConvexError('Cannot remove the last owner')
  }
}

export const list = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.organizationId, 'member')
    return await ctx.db
      .query('memberships')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(100)
  },
})

export const remove = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { user, membership: actorMembership } = await requireOrgAccess(
      ctx,
      args.organizationId,
      'admin',
    )
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_org_user', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', args.userId),
      )
      .unique()

    if (!membership || membership.status !== 'active') {
      throw new ConvexError('Membership is not active')
    }

    if (membership.role === 'owner') {
      if (actorMembership.role !== 'owner') {
        throw new ConvexError('Only owners can remove owners')
      }
      await ensureNotLastOwner(ctx, args.organizationId)
    }

    await ctx.db.patch(membership._id, {
      status: 'removed',
      updatedAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      organizationId: args.organizationId,
      actorUserId: user._id,
      action: 'memberships.remove',
      resourceType: 'membership',
      resourceId: membership._id,
    })
  },
})

export const updateRole = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const { user, membership: actorMembership } = await requireOrgAccess(
      ctx,
      args.organizationId,
      'admin',
    )
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_org_user', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', args.userId),
      )
      .unique()

    if (!membership || membership.status !== 'active') {
      throw new ConvexError('Membership is not active')
    }

    const changesOwnerRole = membership.role === 'owner' || args.role === 'owner'
    if (changesOwnerRole && actorMembership.role !== 'owner') {
      throw new ConvexError('Only owners can change owner roles')
    }

    if (membership.role === 'owner' && args.role !== 'owner') {
      await ensureNotLastOwner(ctx, args.organizationId)
    }

    if (membership.role === args.role) {
      return membership._id
    }

    await ctx.db.patch(membership._id, {
      role: args.role,
      updatedAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      organizationId: args.organizationId,
      actorUserId: user._id,
      action: 'memberships.updateRole',
      resourceType: 'membership',
      resourceId: membership._id,
    })

    return membership._id
  },
})
