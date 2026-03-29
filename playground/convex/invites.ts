import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import {
  requireActor,
  resolveActor,
  serviceAuthArgs,
  tryResolveActor,
} from './lib/actor'
import { assertPermission } from './lib/access'
import { checkPermission, type Role } from './permissions.config'

export const listPending = query({
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await tryResolveActor(ctx, args)
    if (!actor?.orgId) return []

    const allowed = checkPermission(
      { role: actor.role as Role, userId: actor.userId },
      'org.invite',
    )
    if (!allowed) return []

    return await ctx.db
      .query('invites')
      .withIndex('by_organization', (q) => q.eq('organizationId', actor.orgId as any))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
    ...serviceAuthArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    assertPermission(actor, 'org.invite')

    if (args.role === 'admin' && actor.role !== 'owner') {
      throw new Error('Only owner can invite admins')
    }

    const existing = await ctx.db
      .query('invites')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .filter((q) =>
        q.and(
          q.eq(q.field('organizationId'), actor.orgId as any),
          q.eq(q.field('status'), 'pending'),
        ),
      )
      .first()

    if (existing) {
      throw new Error('Already invited')
    }

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .filter((q) => q.eq(q.field('organizationId'), actor.orgId as any))
      .first()

    if (existingUser) {
      throw new Error('Already a member')
    }

    return await ctx.db.insert('invites', {
      email: args.email,
      role: args.role,
      organizationId: actor.orgId as any,
      invitedBy: actor.userId,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
  },
})

export const revoke = mutation({
  args: { id: v.id('invites'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    assertPermission(actor, 'org.invite')

    const invite = await ctx.db.get(args.id)
    if (!invite) throw new Error('Invite not found')
    if (invite.organizationId !== actor.orgId) {
      throw new Error('Invite not in your organization')
    }
    if (invite.status !== 'pending') {
      throw new Error('Invite is not pending')
    }

    await ctx.db.patch(args.id, { status: 'revoked' })
  },
})

export const accept = mutation({
  args: { id: v.id('invites'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await resolveActor(ctx, args)
    const user = actor._id
      ? await ctx.db.get(actor._id)
      : await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
        .first()

    if (!user) throw new Error('User not found')

    const invite = await ctx.db.get(args.id)
    if (!invite) throw new Error('Invite not found')
    if (invite.email !== user.email) {
      throw new Error('Invite is for a different email')
    }
    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer valid')
    }
    if (invite.expiresAt < Date.now()) {
      await ctx.db.patch(args.id, { status: 'expired' })
      throw new Error('Invite has expired')
    }
    if (user.organizationId) {
      throw new Error('You are already in an organization')
    }

    await ctx.db.patch(args.id, { status: 'accepted' })
    await ctx.db.patch(user._id, {
      organizationId: invite.organizationId,
      role: invite.role,
      updatedAt: Date.now(),
    })
  },
})

export const getMyInvites = query({
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await tryResolveActor(ctx, args)
    if (!actor) return []

    const user = actor._id
      ? await ctx.db.get(actor._id)
      : await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
        .first()

    if (!user?.email) return []

    return await ctx.db
      .query('invites')
      .withIndex('by_email', (q) => q.eq('email', user.email))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .collect()
  },
})
