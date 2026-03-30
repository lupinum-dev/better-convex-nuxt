import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'

import {
  authedMutation,
  openQuery,
  scopedMutation,
} from './functions'
import { getUserRowFromActor } from './lib/user_row'
import { checkPermission, type Role } from './permissions.config'

export const listPending = openQuery({
  args: {},
  handler: async ({ actor, db }) => {
    if (!actor?.tenantId) return []
    const tenantId = actor.tenantId as Id<'organizations'>

    const allowed = checkPermission(
      { role: actor.role as Role, userId: actor.userId },
      'org.invite',
    )
    if (!allowed) return []

    return await db
      .query('invites')
      .withIndex('by_organization', q => q.eq('organizationId', tenantId))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .order('desc')
      .collect()
  },
})

export const create = scopedMutation({
  args: {
    email: v.string(),
    role: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  require: 'org.invite',
  handler: async ({ db, actor }, args) => {
    const tenantId = actor.tenantId as Id<'organizations'>
    if (args.role === 'admin' && actor.role !== 'owner') {
      throw new Error('Only owner can invite admins')
    }

    const existing = await db
      .query('invites')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .filter((q) =>
        q.and(
          q.eq(q.field('organizationId'), tenantId),
          q.eq(q.field('status'), 'pending'),
        ),
      )
      .first()

    if (existing) {
      throw new Error('Already invited')
    }

    const existingUser = await db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .filter(q => q.eq(q.field('organizationId'), tenantId))
      .first()

    if (existingUser) {
      throw new Error('Already a member')
    }

    return await db.insert('invites', {
      email: args.email,
      role: args.role,
      invitedBy: actor.userId,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
  },
})

export const revoke = scopedMutation({
  args: { id: v.id('invites') },
  require: 'org.invite',
  resource: (args) => args.id,
  handler: async ({ db, resource }, args) => {
    if (!resource) throw new Error('Invite not found')
    if (resource.status !== 'pending') {
      throw new Error('Invite is not pending')
    }

    await db.patch(args.id, { status: 'revoked' })
  },
})

export const accept = authedMutation({
  args: { id: v.id('invites') },
  handler: async ({ db, actor }, args) => {
    const user = await getUserRowFromActor(db, actor)
    if (!user) throw new Error('User not found')

    const invite = await db.get(args.id)
    if (!invite) throw new Error('Invite not found')
    if (invite.email !== user.email) {
      throw new Error('Invite is for a different email')
    }
    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer valid')
    }
    if (invite.expiresAt < Date.now()) {
      await db.patch(args.id, { status: 'expired' })
      throw new Error('Invite has expired')
    }
    if (user.organizationId) {
      throw new Error('You are already in an organization')
    }

    await db.patch(args.id, { status: 'accepted' })
    await db.patch(user._id, {
      organizationId: invite.organizationId,
      role: invite.role,
      updatedAt: Date.now(),
    })
  },
})

export const getMyInvites = openQuery({
  args: {},
  handler: async ({ actor, db }) => {
    if (!actor) return []

    const user = await getUserRowFromActor(db, actor)
    if (!user?.email) return []

    return await db
      .query('invites')
      .withIndex('by_email', (q) => q.eq('email', user.email))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .collect()
  },
})
