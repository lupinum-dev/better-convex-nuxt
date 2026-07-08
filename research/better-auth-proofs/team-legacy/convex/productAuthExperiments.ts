import { ConvexError, v } from 'convex/values'

import { components } from './_generated/api'
import { mutation, query } from './_generated/server'
import { authComponent, createAuth } from './auth'

type ProjectPermission = 'create' | 'read' | 'update' | 'delete'

async function getBetterAuthHeaders(
  ctx: Parameters<typeof authComponent.getHeaders>[0],
  sessionTokenForExperiment?: string,
) {
  if (sessionTokenForExperiment) {
    if (process.env.ALLOW_TEST_RESET !== 'true') {
      throw new ConvexError('Session token experiment path is disabled')
    }
    return new Headers({ authorization: `Bearer ${sessionTokenForExperiment}` })
  }

  return await authComponent.getHeaders(ctx)
}

async function requireProjectPermission(
  ctx: Parameters<typeof authComponent.getHeaders>[0],
  args: {
    organizationId: string
    permission: ProjectPermission
    sessionTokenForExperiment?: string
  },
) {
  const headers = await getBetterAuthHeaders(ctx, args.sessionTokenForExperiment)
  const auth = createAuth(ctx)
  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw new ConvexError('Unauthenticated')
  }

  const allowed = await auth.api.hasPermission({
    headers,
    body: {
      organizationId: args.organizationId,
      permissions: {
        project: [args.permission],
      },
    },
  })

  if (!allowed.success) {
    throw new ConvexError(`Missing project:${args.permission} permission`)
  }

  return session.user
}

async function requireTeamMembership(
  ctx: Parameters<typeof authComponent.getHeaders>[0],
  args: {
    organizationId: string
    teamId: string
    authUserId: string
  },
) {
  const team = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'team',
    where: [
      { field: '_id', value: args.teamId },
      { field: 'organizationId', value: args.organizationId },
    ],
  })

  if (!team) {
    throw new ConvexError('Team does not belong to organization')
  }

  const teamMember = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'teamMember',
    where: [
      { field: 'teamId', value: args.teamId },
      { field: 'userId', value: args.authUserId },
    ],
  })

  if (!teamMember) {
    throw new ConvexError('User is not a member of the team')
  }
}

export const createProject = mutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    sessionTokenForExperiment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const user = await requireProjectPermission(ctx, {
      organizationId: args.organizationId,
      permission: 'create',
      sessionTokenForExperiment: args.sessionTokenForExperiment,
    })

    const projectId = await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      name,
      createdByAuthUserId: user.id,
      createdAt: Date.now(),
    })

    await ctx.db.insert('auditEvents', {
      organizationId: args.organizationId,
      actorAuthUserId: user.id,
      action: 'projects.create',
      resourceType: 'project',
      resourceId: projectId,
      createdAt: Date.now(),
    })

    return projectId
  },
})

export const createTeamProject = mutation({
  args: {
    organizationId: v.string(),
    teamId: v.string(),
    name: v.string(),
    sessionTokenForExperiment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const user = await requireProjectPermission(ctx, {
      organizationId: args.organizationId,
      permission: 'create',
      sessionTokenForExperiment: args.sessionTokenForExperiment,
    })
    await requireTeamMembership(ctx, {
      organizationId: args.organizationId,
      teamId: args.teamId,
      authUserId: user.id,
    })

    const projectId = await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      teamId: args.teamId,
      name,
      createdByAuthUserId: user.id,
      createdAt: Date.now(),
    })

    await ctx.db.insert('auditEvents', {
      organizationId: args.organizationId,
      actorAuthUserId: user.id,
      action: 'projects.create',
      resourceType: 'project',
      resourceId: projectId,
      createdAt: Date.now(),
    })

    return projectId
  },
})

export const listProjects = query({
  args: {
    organizationId: v.string(),
    sessionTokenForExperiment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectPermission(ctx, {
      organizationId: args.organizationId,
      permission: 'read',
      sessionTokenForExperiment: args.sessionTokenForExperiment,
    })

    return await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(100)
  },
})

export const listTeamProjects = query({
  args: {
    organizationId: v.string(),
    teamId: v.string(),
    sessionTokenForExperiment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireProjectPermission(ctx, {
      organizationId: args.organizationId,
      permission: 'read',
      sessionTokenForExperiment: args.sessionTokenForExperiment,
    })
    await requireTeamMembership(ctx, {
      organizationId: args.organizationId,
      teamId: args.teamId,
      authUserId: user.id,
    })

    return await ctx.db
      .query('projects')
      .withIndex('by_org_team', (q) =>
        q.eq('organizationId', args.organizationId).eq('teamId', args.teamId),
      )
      .order('desc')
      .take(100)
  },
})
