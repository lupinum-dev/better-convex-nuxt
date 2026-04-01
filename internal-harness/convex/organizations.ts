import { defineArgs } from 'better-convex-nuxt/args'
import { can, authorize } from 'better-convex-nuxt/auth'
import { withTrustedCaller } from 'better-convex-nuxt/trusted-caller'
import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canManageMembers, canManageOrgSettings } from './auth/checks'
import { getUserRowFromActor } from './lib/user_row'

const createOrganizationArgs = defineArgs({
  args: {
    name: v.string(),
    slug: v.string(),
  },
})

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor?.tenantId) return null
    return await ctx.db.get(actor.tenantId as Id<'organizations'>)
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('organizations').order('desc').collect()
  },
})

export const create = mutation({
  args: withTrustedCaller(createOrganizationArgs.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Create organization', actor !== null)

    const user = await getUserRowFromActor(ctx.db, actor)
    if (!user) throw new Error('User not found')

    const existing = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (existing) throw new Error('Organization slug already exists')

    const orgId = await ctx.db.insert('organizations', {
      name: args.name,
      slug: args.slug,
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await ctx.db.patch(user._id, {
      organizationId: orgId,
      role: 'owner',
      updatedAt: Date.now(),
    })

    return orgId
  },
})

export const updateSettings = mutation({
  args: {
    name: v.optional(v.string()),
    billingEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Update organization settings', canManageOrgSettings)
    if (!actor.tenantId) throw new Error('No organization selected')

    await ctx.db.patch(actor.tenantId as Id<'organizations'>, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.billingEmail !== undefined ? { billingEmail: args.billingEmail } : {}),
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
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor?.tenantId) return []
    if (!can(actor, canManageMembers)) return []

    return await ctx.db
      .query('users')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', actor.tenantId as Id<'organizations'>),
      )
      .collect()
  },
})

export const changeMemberRole = mutation({
  args: {
    userId: v.id('users'),
    newRole: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Manage organization members', canManageMembers)

    const targetUser = await ctx.db.get(args.userId)
    if (!targetUser) throw new Error('User not found')
    if (targetUser.organizationId !== actor.tenantId)
      throw new Error('User not in your organization')
    if (targetUser.role === 'owner') throw new Error("Cannot change owner's role")
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
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Remove organization member', canManageMembers)

    const targetUser = await ctx.db.get(args.userId)
    if (!targetUser) throw new Error('User not found')
    if (targetUser.organizationId !== actor.tenantId)
      throw new Error('User not in your organization')
    if (targetUser.authId === actor.userId)
      throw new Error('Cannot remove yourself - use Leave Organization instead')
    if (targetUser.role === 'owner') throw new Error('Cannot remove owner')
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
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Leave organization', actor !== null)

    if (actor.role === 'owner') {
      throw new Error('Owner cannot leave organization. Transfer ownership first.')
    }

    const user = await getUserRowFromActor(ctx.db, actor)
    if (!user) throw new Error('User not found')

    await ctx.db.patch(user._id, {
      organizationId: undefined,
      role: 'member',
      updatedAt: Date.now(),
    })
  },
})
