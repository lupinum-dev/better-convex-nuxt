import { authRequired, open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { mutation, query } from '../functions'

const joinRoleValidator = v.union(
  v.literal('admin'),
  v.literal('editor'),
  v.literal('contributor'),
  v.literal('viewer'),
)

export const listWorkspaces = query({
  guard: open,
  args: {},
  handler: async (ctx) => {
    const workspaces = await ctx.db.query('workspaces').order('desc').collect()
    return workspaces.map(({ _id, name, slug }) => ({ _id, name, slug }))
  },
})

export const createWorkspace = mutation({
  guard: authRequired,
  args: { name: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const principal = (await ctx.principal()) as { userId: string }

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
  guard: authRequired,
  args: {
    slug: v.string(),
    role: joinRoleValidator,
    managerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const principal = (await ctx.principal()) as { userId: string }

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

    let managerId: string | undefined
    if (args.managerEmail) {
      const manager = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', args.managerEmail))
        .first()
      if (manager) managerId = manager.authId
    }

    await ctx.db.patch(user._id, {
      workspaceId: workspace._id,
      role: args.role,
      managerId,
      updatedAt: Date.now(),
    })

    return workspace._id
  },
})
