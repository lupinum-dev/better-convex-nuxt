import { can, definePermissionContext, deny, open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { saasPermissionKeys, type SaasPermissionMap } from '../shared/permissions'
import { getActor } from './auth/actor'
import {
  canArchiveProject,
  canAssignTask,
  canComment,
  canCreateProject,
  canCreateTask,
  canExportProjects,
  hasRole,
  canManageMembers,
  canReadProject,
  canViewAudit,
  hasFeature,
} from './auth/checks'
import { getUsage } from './auth/limits'
import { app } from './functions'
import { planValidator } from './schema'

const joinRoleValidator = v.union(v.literal('admin'), v.literal('member'), v.literal('viewer'))
type Actor = NonNullable<Awaited<ReturnType<typeof getActor>>>

export const listWorkspaces = app.query({
  args: {},
  guard: open,
  handler: async (ctx) => {
    // DEMO ONLY: onboarding stays easier when example users can discover seedable workspaces.
    const workspaces = await ctx.db.query('workspaces').order('desc').collect()
    return workspaces.map(({ _id, name, slug }) => ({ _id, name, slug }))
  },
})

export const getPermissionContext = app.query(
  definePermissionContext({
    resolve: getActor,
    guards: {
      [saasPermissionKeys.projectCreate]: canCreateProject,
      [saasPermissionKeys.projectRead]: canReadProject,
      [saasPermissionKeys.projectArchive]: canArchiveProject,
      [saasPermissionKeys.projectExport]: canExportProjects,
      [saasPermissionKeys.taskCreate]: canCreateTask,
      [saasPermissionKeys.taskAssign]: canAssignTask,
      [saasPermissionKeys.commentCreate]: canComment,
      [saasPermissionKeys.workspaceMembers]: canManageMembers,
      [saasPermissionKeys.workspaceAudit]: canViewAudit,
      [saasPermissionKeys.workspaceExports]: hasFeature('exports'),
    } satisfies Record<keyof SaasPermissionMap, (actor: Actor) => boolean>,
    extend: async (ctx, actor) => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', actor.userId))
        .first()

      return {
        plan: actor.plan,
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        usage: {
          projects: await getUsage(ctx.db, actor, 'projects'),
        },
        can: {
          [saasPermissionKeys.projectCreate]: can(actor, canCreateProject),
          [saasPermissionKeys.projectRead]: can(actor, canReadProject),
          [saasPermissionKeys.projectArchive]: can(actor, canArchiveProject),
          [saasPermissionKeys.projectExport]: can(actor, canExportProjects),
          [saasPermissionKeys.taskCreate]: can(actor, canCreateTask),
          [saasPermissionKeys.taskAssign]: can(actor, canAssignTask),
          [saasPermissionKeys.commentCreate]: can(actor, canComment),
          [saasPermissionKeys.workspaceMembers]: can(actor, canManageMembers),
          [saasPermissionKeys.workspaceAudit]: can(actor, canViewAudit),
          [saasPermissionKeys.workspaceExports]: can(actor, hasFeature('exports')),
        } satisfies SaasPermissionMap,
      }
    },
  }),
)

export const createWorkspace = app.mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  guard: open,
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

export const joinWorkspace = app.mutation({
  args: {
    slug: v.string(),
    role: joinRoleValidator,
  },
  guard: open,
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

export const upgradePlan = app.mutation({
  args: {
    plan: planValidator,
  },
  guard: hasRole('owner', 'admin'),
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    const workspace = await ctx.db.get(actor.tenantId)
    if (!workspace) throw new Error('Workspace not found.')

    await ctx.db.patch(workspace._id, {
      plan: args.plan,
      updatedAt: Date.now(),
    })
  },
})
