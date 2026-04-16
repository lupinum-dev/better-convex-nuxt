import { authenticated, open } from '@lupinum/trellis/auth'

import { createWorkspaceArgs, joinWorkspaceArgs } from '../shared/schemas/kanban'
import { mutation, publicQuery, query } from './functions'

const starterColumns = ['Inbox', 'Doing', 'Done']

export const listWorkspaces = publicQuery({
  guard: open,
  args: {},
  handler: async (ctx) => {
    const workspaces = await ctx.db.query('workspaces').order('desc').collect()
    return workspaces.map(({ _id, name, slug }) => ({ _id, name, slug }))
  },
})

export const getSessionContext = query({
  guard: authenticated,
  args: {},
  handler: async (ctx) => {
    const principal = await ctx.principal()
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', principal.userId))
      .first()

    if (!user) throw new Error('Current user row not found.')

    const workspace = user.workspaceId ? await ctx.db.get(user.workspaceId) : null

    return {
      user: {
        authId: user.authId,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
      },
      actorRole: user.role,
      workspace: workspace
        ? {
            _id: workspace._id,
            name: workspace.name,
            slug: workspace.slug,
          }
        : null,
    }
  },
})

export const createWorkspace = mutation({
  guard: authenticated,
  args: createWorkspaceArgs.args,
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
      name: args.name.trim(),
      slug: args.slug.trim(),
      ownerId: principal.userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(user._id, {
      workspaceId,
      role: 'owner',
      updatedAt: now,
    })

    const boardId = await ctx.db.insert('boards', {
      title: `${args.name.trim()} board`,
      workspaceId,
      ownerId: principal.userId,
      archived: false,
      createdAt: now,
      updatedAt: now,
    })

    for (const [index, title] of starterColumns.entries()) {
      await ctx.db.insert('columns', {
        workspaceId,
        boardId,
        title,
        position: index,
      })
    }

    return workspaceId
  },
})

export const joinWorkspace = mutation({
  guard: authenticated,
  args: joinWorkspaceArgs.args,
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
