import { v } from 'convex/values'

import {
  authedMutation,
  openQuery,
  publicQuery,
  scopedMutation,
} from './functions'
import { getUserRowFromActor } from './lib/user_row'
import { checkPermission, type Role } from './permissions.config'

export const getCurrent = openQuery({
  args: {},
  handler: async ({ actor, db }) => {
    if (!actor?.orgId) return null
    return await db.get(actor.orgId as any)
  },
})

export const list = publicQuery({
  args: {},
  handler: async ({ db }) => {
    return await db.query('organizations').order('desc').collect()
  },
})

export const create = authedMutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async ({ db, actor }, args) => {
    const user = await getUserRowFromActor(db, actor)
    if (!user) throw new Error('User not found')

    const existing = await db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()

    if (existing) {
      throw new Error('Organization slug already exists')
    }

    const orgId = await db.insert('organizations', {
      name: args.name,
      slug: args.slug,
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await db.patch(user._id, {
      organizationId: orgId,
      role: 'owner',
      updatedAt: Date.now(),
    })

    return orgId
  },
})

export const updateSettings = scopedMutation({
  args: {
    name: v.optional(v.string()),
    billingEmail: v.optional(v.string()),
  },
  require: 'org.settings',
  handler: async ({ db, actor }, args) => {
    await db.patch(actor.orgId as any, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.billingEmail !== undefined ? { billingEmail: args.billingEmail } : {}),
      updatedAt: Date.now(),
    })
  },
})

export const getByIds = publicQuery({
  args: {
    ids: v.array(v.id('organizations')),
  },
  handler: async ({ db }, args) => {
    const orgs = await Promise.all(args.ids.map(id => db.get(id)))
    return orgs.filter((org): org is NonNullable<typeof org> => org !== null)
  },
})

export const getMembers = openQuery({
  args: {},
  handler: async ({ actor, db }) => {
    if (!actor?.orgId) return []

    const canView = checkPermission(
      { role: actor.role as Role, userId: actor.userId },
      'org.members',
    )
    if (!canView) return []

    return await db
      .query('users')
      .withIndex('by_organization', q => q.eq('organizationId', actor.orgId as any))
      .collect()
  },
})

export const changeMemberRole = scopedMutation({
  args: {
    userId: v.id('users'),
    newRole: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  require: 'org.members',
  handler: async ({ db, actor }, args) => {
    const targetUser = await db.get(args.userId)
    if (!targetUser) throw new Error('User not found')
    if (targetUser.organizationId !== actor.orgId) throw new Error('User not in your organization')
    if (targetUser.role === 'owner') throw new Error("Cannot change owner's role")
    if (args.newRole === 'admin' && actor.role !== 'owner') {
      throw new Error('Only owner can promote to admin')
    }

    await db.patch(args.userId, {
      role: args.newRole,
      updatedAt: Date.now(),
    })
  },
})

export const removeMember = scopedMutation({
  args: { userId: v.id('users') },
  require: 'org.members',
  handler: async ({ db, actor }, args) => {
    const targetUser = await db.get(args.userId)
    if (!targetUser) throw new Error('User not found')
    if (targetUser.organizationId !== actor.orgId) throw new Error('User not in your organization')
    if (targetUser.authId === actor.userId) {
      throw new Error('Cannot remove yourself - use Leave Organization instead')
    }
    if (targetUser.role === 'owner') throw new Error('Cannot remove owner')
    if (targetUser.role === 'admin' && actor.role !== 'owner') {
      throw new Error('Only owner can remove admins')
    }

    await db.patch(args.userId, {
      organizationId: undefined,
      role: 'member',
      updatedAt: Date.now(),
    })
  },
})

export const leave = scopedMutation({
  args: {},
  handler: async ({ db, actor }) => {
    if (actor.role === 'owner') {
      throw new Error('Owner cannot leave organization. Transfer ownership first.')
    }

    const user = await getUserRowFromActor(db, actor)
    if (!user) throw new Error('User not found')

    await db.patch(user._id, {
      organizationId: undefined,
      role: 'member',
      updatedAt: Date.now(),
    })
  },
})
