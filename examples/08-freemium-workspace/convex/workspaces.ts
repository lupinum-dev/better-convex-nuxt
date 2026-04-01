import { can, deny } from 'better-convex-nuxt/auth'
/**
 * Why this file exists:
 * Freemium UIs need both static plan flags and current usage, so the context query carries both.
 */
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canCreateProject, hasFeature } from './auth/checks'
import { getUsage } from './auth/limits'
import { planValidator } from './schema'

export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    // DEMO ONLY: onboarding stays easier when example users can discover seedable workspaces.
    const workspaces = await ctx.db.query('workspaces').order('desc').collect()
    return workspaces.map(({ _id, name, slug }) => ({ _id, name, slug }))
  },
})

export const getPermissionContext = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return null

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
      .first()

    return {
      role: actor.role,
      plan: actor.plan,
      userId: actor.userId,
      tenantId: actor.tenantId,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      usage: {
        projects: await getUsage(ctx.db, actor, 'projects'),
      },
      can: {
        'project.create': can(actor, canCreateProject),
        'workspace.exports': can(actor, hasFeature('exports')),
      },
    }
  },
})

export const createWorkspace = mutation({
  args: { name: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()
    if (existing) throw new Error('That workspace slug is already taken.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    const now = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: identity.subject,
      plan: 'free',
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(user._id, {
      workspaceId,
      role: 'owner',
      updatedAt: now,
    })

    return workspaceId
  },
})

export const joinWorkspace = mutation({
  args: {
    slug: v.string(),
    role: v.union(v.literal('admin'), v.literal('member')),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const workspace = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()
    if (!workspace) throw new Error('Workspace not found.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    await ctx.db.patch(user._id, {
      workspaceId: workspace._id,
      role: args.role,
      updatedAt: Date.now(),
    })

    return workspace._id
  },
})

export const upgradePlan = mutation({
  args: {
    plan: planValidator,
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    if (!actor || !['owner', 'admin'].includes(actor.role)) throw deny('Requires workspace admin.')

    const workspace = await ctx.db.get(actor.tenantId)
    if (!workspace) throw new Error('Workspace not found.')

    await ctx.db.patch(workspace._id, {
      plan: args.plan,
      updatedAt: Date.now(),
    })
  },
})
