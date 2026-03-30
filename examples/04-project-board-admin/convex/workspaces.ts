import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

import { can, deny } from 'better-convex-nuxt/auth'

import {
  canArchiveProject,
  canAssignTask,
  canComment,
  canCreateProject,
  canCreateTask,
  canManageMembers,
  canViewAudit,
} from './auth/checks'
import { getActor } from './auth/principal'

const joinRoleValidator = v.union(v.literal('admin'), v.literal('member'), v.literal('viewer'))

export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query('workspaces').order('desc').collect()
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

    return {
      role: actor.role,
      userId: actor.userId,
      tenantId: actor.tenantId,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      can: {
        'project.create': can(actor, canCreateProject),
        'project.read': true,
        'project.archive': can(actor, canArchiveProject),
        'task.create': can(actor, canCreateTask),
        'task.assign': can(actor, canAssignTask),
        'comment.create': can(actor, canComment),
        'workspace.members': can(actor, canManageMembers),
        'workspace.audit': can(actor, canViewAudit),
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
      .query('workspaces')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()

    if (existing) throw new Error('That workspace slug is already taken.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
      .first()

    if (!user) throw new Error('Current user row not found.')

    const now = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: identity.subject,
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
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const workspace = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()

    if (!workspace) throw new Error('Workspace not found.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
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
