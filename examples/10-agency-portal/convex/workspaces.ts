import { v } from 'convex/values'

import { can, deny } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { hasRole } from './auth/checks'
import { getMemberships, requireWorkspaceMembership } from './auth/agency'

export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => ctx.db.query('workspaces').order('desc').collect(),
})

export const listAccessibleWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return []

    const memberships = await getMemberships(ctx.db, actor.userId)
    return Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId)
        return {
          workspaceId: membership.workspaceId,
          role: membership.role,
          name: workspace?.name ?? membership.workspaceId,
        }
      }),
    )
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
    const memberships = await getMemberships(ctx.db, actor.userId)

    return {
      role: actor.role,
      userId: actor.userId,
      tenantId: actor.tenantId,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      can: {
        'project.create': can(actor, hasRole('owner', 'member')),
        'agency.dashboard': memberships.some(m =>
          ['agency_admin', 'agency_manager'].includes(m.role),
        ),
      },
    }
  },
})

export const createWorkspace = mutation({
  args: { name: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()
    if (existing) throw new Error('That workspace slug is already taken.')

    const now = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: user.authId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('memberships', {
      userId: user.authId,
      workspaceId,
      role: 'owner',
      createdAt: now,
    })

    await ctx.db.patch(user._id, {
      workspaceId,
      updatedAt: now,
    })

    return workspaceId
  },
})

export const joinWorkspace = mutation({
  args: {
    slug: v.string(),
    role: v.union(v.literal('member'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    const workspace = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()
    if (!workspace) throw new Error('Workspace not found.')

    await ctx.db.insert('memberships', {
      userId: user.authId,
      workspaceId: workspace._id,
      role: args.role,
      createdAt: Date.now(),
    })

    await ctx.db.patch(user._id, {
      workspaceId: workspace._id,
      updatedAt: Date.now(),
    })

    return workspace._id
  },
})

export const switchWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    await requireWorkspaceMembership(ctx.db, user.authId, args.workspaceId)
    await ctx.db.patch(user._id, {
      workspaceId: args.workspaceId,
      updatedAt: Date.now(),
    })
  },
})

export const seedAgencyPortfolio = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) throw deny('Not authenticated.')

    const now = Date.now()
    const clientA = await ctx.db.insert('workspaces', {
      name: 'Client A',
      slug: `client-a-${now}`,
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    const clientB = await ctx.db.insert('workspaces', {
      name: 'Client B',
      slug: `client-b-${now}`,
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('memberships', {
      userId: actor.userId,
      workspaceId: clientA,
      role: 'agency_manager',
      createdAt: now,
    })
    await ctx.db.insert('memberships', {
      userId: actor.userId,
      workspaceId: clientB,
      role: 'agency_manager',
      createdAt: now,
    })

    await ctx.db.insert('projects', {
      workspaceId: clientA,
      name: 'Client A campaign',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('projects', {
      workspaceId: clientB,
      name: 'Client B redesign',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    return { clientA, clientB }
  },
})
