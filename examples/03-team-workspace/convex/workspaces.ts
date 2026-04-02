import { can, deny } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { teamWorkspacePermissionKeys, type TeamWorkspacePermissionMap } from '../shared/permissions'
import { canCreateTodo, canReadTodo } from './auth/checks'
import { appMutation, appQuery } from './functions'

const joinRoleValidator = v.union(v.literal('admin'), v.literal('member'), v.literal('viewer'))

export const listWorkspaces = appQuery({
  args: {},
  handler: async (ctx) => {
    // DEMO ONLY: onboarding stays easier when example users can discover seedable workspaces.
    const workspaces = await ctx.db.query('workspaces').order('desc').collect()
    return workspaces.map(({ _id, name, slug }) => ({ _id, name, slug }))
  },
})

export const getPermissionContext = appQuery({
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    if (!actor) return null

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
      .first()

    if (!user) return null

    const permissions = {
      [teamWorkspacePermissionKeys.todoRead]: can(actor, canReadTodo),
      [teamWorkspacePermissionKeys.todoCreate]: can(actor, canCreateTodo),
    } satisfies TeamWorkspacePermissionMap

    return {
      role: user.role,
      userId: user.authId,
      tenantId: user.workspaceId,
      email: user.email,
      displayName: user.displayName,
      can: permissions,
    }
  },
})

export const createWorkspace = appMutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
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
    const tenantId = await ctx.db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: identity.subject,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(user._id, {
      workspaceId: tenantId,
      role: 'owner',
      updatedAt: now,
    })

    return tenantId
  },
})

export const joinWorkspace = appMutation({
  args: {
    slug: v.string(),
    role: joinRoleValidator,
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
