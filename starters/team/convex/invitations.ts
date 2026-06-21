import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireOrgAccess } from './access'
import { writeAuditEvent } from './audit'
import { roleValidator } from './schema'
import { requireCurrentUser } from './users'

export const create = mutation({
  args: {
    organizationId: v.id('organizations'),
    email: v.string(),
    role: roleValidator
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAccess(ctx, args.organizationId, 'admin')
    const email = args.email.trim().toLowerCase()
    if (!email) {
      throw new ConvexError('Email is required')
    }

    const invitationId = await ctx.db.insert('invitations', {
      organizationId: args.organizationId,
      email,
      role: args.role,
      token: crypto.randomUUID(),
      status: 'pending',
      createdBy: user._id,
      createdAt: Date.now()
    })

    await writeAuditEvent(ctx, {
      organizationId: args.organizationId,
      actorUserId: user._id,
      action: 'invitations.create',
      resourceType: 'invitation',
      resourceId: invitationId
    })

    return invitationId
  }
})

export const accept = mutation({
  args: {
    token: v.string()
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const invitation = await ctx.db
      .query('invitations')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique()

    if (!invitation || invitation.status !== 'pending') {
      throw new ConvexError('Invitation is not pending')
    }

    const existing = await ctx.db
      .query('memberships')
      .withIndex('by_org_user', (q) =>
        q.eq('organizationId', invitation.organizationId).eq('userId', user._id)
      )
      .unique()

    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: invitation.role,
        status: 'active',
        updatedAt: now
      })
    } else {
      await ctx.db.insert('memberships', {
        organizationId: invitation.organizationId,
        userId: user._id,
        role: invitation.role,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
    }

    await ctx.db.patch(invitation._id, {
      status: 'accepted',
      acceptedAt: now
    })

    await writeAuditEvent(ctx, {
      organizationId: invitation.organizationId,
      actorUserId: user._id,
      action: 'invitations.accept',
      resourceType: 'invitation',
      resourceId: invitation._id
    })
  }
})

export const listPending = query({
  args: {
    organizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.organizationId, 'admin')
    return await ctx.db
      .query('invitations')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', args.organizationId).eq('status', 'pending')
      )
      .collect()
  }
})
