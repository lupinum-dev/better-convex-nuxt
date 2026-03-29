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

export const getCurrent = query({
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await tryResolveActor(ctx, args)
    if (!actor?.orgId) return null
    return await ctx.db.get(actor.orgId as any)
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('organizations').order('desc').collect()
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    ...serviceAuthArgs,
  },
  handler: async (ctx, args) => {
    const actor = await resolveActor(ctx, args)

    const existing = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (existing) {
      throw new Error('Organization slug already exists')
    }

    const orgId = await ctx.db.insert('organizations', {
      name: args.name,
      slug: args.slug,
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    if (actor._id) {
      await ctx.db.patch(actor._id, {
        organizationId: orgId,
        role: 'owner',
        updatedAt: Date.now(),
      })
    }

    return orgId
  },
})

export const updateSettings = mutation({
  args: {
    name: v.optional(v.string()),
    billingEmail: v.optional(v.string()),
    ...serviceAuthArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    assertPermission(actor, 'org.settings')

    await ctx.db.patch(actor.orgId as any, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.billingEmail !== undefined && { billingEmail: args.billingEmail }),
      updatedAt: Date.now(),
    })
  },
})

export const getByIds = query({
  args: {
    ids: v.array(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const orgs = await Promise.all(args.ids.map((id) => ctx.db.get(id)))
    return orgs.filter((org): org is NonNullable<typeof org> => org !== null)
  },
})

export const getMembers = query({
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await tryResolveActor(ctx, args)
    if (!actor?.orgId) return []

    const canView = checkPermission(
      { role: actor.role as Role, userId: actor.userId },
      'org.members',
    )
    if (!canView) return []

    return await ctx.db
      .query('users')
      .withIndex('by_organization', (q) => q.eq('organizationId', actor.orgId as any))
      .collect()
  },
})

export const changeMemberRole = mutation({
  args: {
    userId: v.id('users'),
    newRole: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
    ...serviceAuthArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    assertPermission(actor, 'org.members')

    const targetUser = await ctx.db.get(args.userId)
    if (!targetUser) throw new Error('User not found')
    if (targetUser.organizationId !== actor.orgId) {
      throw new Error('User not in your organization')
    }
    if (targetUser.role === 'owner') {
      throw new Error("Cannot change owner's role")
    }
    if (args.newRole === 'admin' && actor.role !== 'owner') {
      throw new Error('Only owner can promote to admin')
    }

    await ctx.db.patch(args.userId, {
      role: args.newRole,
      updatedAt: Date.now(),
    })
  },
})

export const removeMember = mutation({
  args: { userId: v.id('users'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    assertPermission(actor, 'org.members')

    const targetUser = await ctx.db.get(args.userId)
    if (!targetUser) throw new Error('User not found')
    if (targetUser.organizationId !== actor.orgId) {
      throw new Error('User not in your organization')
    }
    if (targetUser.authId === actor.userId) {
      throw new Error('Cannot remove yourself - use Leave Organization instead')
    }
    if (targetUser.role === 'owner') {
      throw new Error('Cannot remove owner')
    }
    if (targetUser.role === 'admin' && actor.role !== 'owner') {
      throw new Error('Only owner can remove admins')
    }

    await ctx.db.patch(args.userId, {
      organizationId: undefined,
      role: 'member',
      updatedAt: Date.now(),
    })
  },
})

export const leave = mutation({
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    if (actor.role === 'owner') {
      throw new Error('Owner cannot leave organization. Transfer ownership first.')
    }

    const user = actor._id
      ? await ctx.db.get(actor._id)
      : await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
        .first()

    if (!user) throw new Error('User not found')

    await ctx.db.patch(user._id, {
      organizationId: undefined,
      role: 'member',
      updatedAt: Date.now(),
    })
  },
})
