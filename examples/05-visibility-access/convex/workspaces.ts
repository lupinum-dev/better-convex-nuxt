import { can, deny } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { knowledgeBasePermissionKeys, type KnowledgeBasePermissionMap } from '../shared/permissions'
import {
  canCreateArticle,
  canCreateKB,
  canCreateShareToken,
  canManageEnrollments,
  canReadArticle,
  canReadKB,
} from './auth/checks'
import { appMutation, appQuery } from './functions'

export const listWorkspaces = appQuery({
  args: {},
  handler: async (ctx) => {
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

    return {
      role: actor.role,
      userId: actor.userId,
      tenantId: actor.tenantId,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      can: {
        [knowledgeBasePermissionKeys.kbCreate]: can(actor, canCreateKB),
        [knowledgeBasePermissionKeys.kbRead]: can(actor, canReadKB),
        [knowledgeBasePermissionKeys.articleCreate]: can(actor, canCreateArticle),
        [knowledgeBasePermissionKeys.articleRead]: can(actor, canReadArticle),
        [knowledgeBasePermissionKeys.enrollmentManage]: can(actor, canManageEnrollments),
        [knowledgeBasePermissionKeys.shareCreate]: can(actor, canCreateShareToken),
      } satisfies KnowledgeBasePermissionMap,
    }
  },
})

export const createWorkspace = appMutation({
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

const joinRoleValidator = v.union(
  v.literal('admin'),
  v.literal('editor'),
  v.literal('contributor'),
  v.literal('viewer'),
)

export const joinWorkspace = appMutation({
  args: {
    slug: v.string(),
    role: joinRoleValidator,
    managerEmail: v.optional(v.string()),
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
