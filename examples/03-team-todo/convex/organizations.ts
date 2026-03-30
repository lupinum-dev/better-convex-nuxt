import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

import { can, deny } from 'better-convex-nuxt/auth'

import {
  canCreateTodo,
  canReadTodo,
} from './auth/checks'
import { getActor } from './auth/actor'

const joinRoleValidator = v.union(v.literal('admin'), v.literal('member'), v.literal('viewer'))

export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query('organizations').order('desc').collect()
  },
})

export const getPermissionContext = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return null

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', actor.userId))
      .first()

    if (!user) return null

    return {
      role: user.role,
      userId: user.authId,
      tenantId: user.organizationId,
      email: user.email,
      displayName: user.displayName,
      can: {
        'todo.read': can(actor, canReadTodo),
        'todo.create': can(actor, canCreateTodo),
      },
    }
  },
})

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const existing = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()

    if (existing) throw new Error('That workspace slug is already taken.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
      .first()

    if (!user) throw new Error('Current user row not found.')

    const now = Date.now()
    const tenantId = await ctx.db.insert('organizations', {
      name: args.name,
      slug: args.slug,
      ownerId: identity.subject,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(user._id, {
      organizationId: tenantId,
      role: 'owner',
      updatedAt: now,
    })

    return tenantId
  },
})

export const joinWorkspace = mutation({
  args: {
    slug: v.string(),
    role: joinRoleValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const organization = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()

    if (!organization) throw new Error('Workspace not found.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
      .first()

    if (!user) throw new Error('Current user row not found.')

    await ctx.db.patch(user._id, {
      organizationId: organization._id,
      role: args.role,
      updatedAt: Date.now(),
    })

    return organization._id
  },
})
