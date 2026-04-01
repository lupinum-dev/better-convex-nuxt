import { authorize } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canInviteMembers } from './auth/checks'
import { loadResource } from './auth/scope'
import { getUserRowFromActor } from './lib/user_row'

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor?.tenantId) return []
    if (!canInviteMembers(actor)) return []

    return await ctx.db
      .query('invites')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', actor.tenantId as Id<'organizations'>),
      )
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Invite member', canInviteMembers)
    if (!actor.tenantId) throw new Error('No organization selected')

    const tenantId = actor.tenantId as Id<'organizations'>
    if (args.role === 'admin' && actor.role !== 'owner') {
      throw new Error('Only owner can invite admins')
    }

    const existing = await ctx.db
      .query('invites')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .filter((q) =>
        q.and(q.eq(q.field('organizationId'), tenantId), q.eq(q.field('status'), 'pending')),
      )
      .first()

    if (existing) throw new Error('Already invited')

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .filter((q) => q.eq(q.field('organizationId'), tenantId))
      .first()

    if (existingUser) throw new Error('Already a member')

    return await ctx.db.insert('invites', {
      email: args.email,
      role: args.role,
      organizationId: tenantId,
      invitedBy: actor.userId,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
  },
})

export const revoke = mutation({
  args: { id: v.id('invites') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Revoke invite', canInviteMembers)

    const invite = loadResource(actor, await ctx.db.get(args.id), 'Invite')
    if (invite.status !== 'pending') throw new Error('Invite is not pending')

    await ctx.db.patch(args.id, { status: 'revoked' })
  },
})

export const accept = mutation({
  args: { id: v.id('invites') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Accept invite', actor !== null)

    const user = await getUserRowFromActor(ctx.db, actor)
    if (!user) throw new Error('User not found')

    const invite = await ctx.db.get(args.id)
    if (!invite) throw new Error('Invite not found')
    if (invite.email !== user.email) throw new Error('Invite is for a different email')
    if (invite.status !== 'pending') throw new Error('Invite is no longer valid')
    if (invite.expiresAt < Date.now()) {
      await ctx.db.patch(args.id, { status: 'expired' })
      throw new Error('Invite has expired')
    }
    if (user.organizationId) throw new Error('You are already in an organization')

    await ctx.db.patch(args.id, { status: 'accepted' })
    await ctx.db.patch(user._id, {
      organizationId: invite.organizationId,
      role: invite.role,
      updatedAt: Date.now(),
    })
  },
})

export const getMyInvites = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return []

    const user = await getUserRowFromActor(ctx.db, actor)
    if (!user?.email) return []

    return await ctx.db
      .query('invites')
      .withIndex('by_email', (q) => q.eq('email', user.email))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .collect()
  },
})
