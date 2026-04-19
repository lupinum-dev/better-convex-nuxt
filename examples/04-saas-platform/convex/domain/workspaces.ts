import { authRequired, open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { hasRole, hasWorkspace, requireWorkspaceTenant } from '../auth/checks'
import { mutation, query } from '../functions'
import { planValidator } from '../schema'

const joinRoleValidator = v.union(v.literal('admin'), v.literal('member'), v.literal('viewer'))

export const listWorkspaces = query({
  args: {},
  guard: open,
  handler: async (ctx) => {
    const workspaces = await ctx.db.query('workspaces').order('desc').collect()
    return workspaces.map(({ _id, name, slug }) => ({ _id, name, slug }))
  },
})

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  guard: authRequired,
  handler: async (ctx, args) => {
    const principal = await ctx.principal()

    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (existing) throw new Error('That workspace slug is already taken.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', principal.userId))
      .first()

    if (!user) throw new Error('Current user row not found.')

    const now = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: principal.userId,
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
    role: joinRoleValidator,
  },
  guard: authRequired,
  handler: async (ctx, args) => {
    const principal = await ctx.principal()

    const workspace = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!workspace) throw new Error('Workspace not found.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', principal.userId))
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
  guard: hasWorkspace.and(hasRole('owner', 'admin')),
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const workspace = await ctx.db.get(workspaceId)
    if (!workspace) throw new Error('Workspace not found.')

    await ctx.db.patch(workspace._id, {
      plan: args.plan,
      updatedAt: Date.now(),
    })
  },
})
