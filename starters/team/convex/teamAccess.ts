import { ConvexError, v } from 'convex/values'

import { query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import { authComponent, createAuth } from './auth'
import {
  requireAuthenticatedUser,
  requireOrgMembership,
  requireProjectTeamAccess,
  requireTeamAccess,
} from './lib/authz'
import { getBetterAuthTeam, listBetterAuthTeamMembers } from './lib/betterAuthRows'

async function hasProjectPermission(
  ctx: QueryCtx,
  args: {
    headers: Headers
    organizationId: string
    permission: 'create' | 'read' | 'update' | 'delete'
  },
) {
  const auth = createAuth(ctx)
  const result = await auth.api.hasPermission({
    headers: args.headers,
    body: {
      organizationId: args.organizationId,
      permissions: {
        project: [args.permission],
      },
    },
  })

  return result.success
}

async function hasManagementPermission(
  ctx: QueryCtx,
  args: {
    headers: Headers
    organizationId: string
    permission: 'update' | 'delete'
  },
) {
  const auth = createAuth(ctx)
  const result = await auth.api.hasPermission({
    headers: args.headers,
    body: {
      organizationId: args.organizationId,
      permissions: {
        member: [args.permission],
      },
    },
  })

  return result.success
}

export const getCapabilities = query({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const team = await getBetterAuthTeam(ctx, {
      teamId: args.teamId,
    })

    if (!team?.organizationId) {
      throw new ConvexError('Team not found')
    }

    const actor = await requireAuthenticatedUser(ctx)
    await requireOrgMembership(ctx, {
      organizationId: team.organizationId,
    })

    const headers = await authComponent.getHeaders(ctx)
    const canViewProjectsPromise = hasProjectPermission(ctx, {
      headers,
      organizationId: team.organizationId,
      permission: 'read',
    })
    const canCreateProjectPromise = hasProjectPermission(ctx, {
      headers,
      organizationId: team.organizationId,
      permission: 'create',
    })
    const canUpdateProjectPromise = hasProjectPermission(ctx, {
      headers,
      organizationId: team.organizationId,
      permission: 'update',
    })
    const canDeleteProjectPromise = hasProjectPermission(ctx, {
      headers,
      organizationId: team.organizationId,
      permission: 'delete',
    })

    await Promise.all([
      canViewProjectsPromise,
      canCreateProjectPromise,
      canUpdateProjectPromise,
      canDeleteProjectPromise,
    ])
    const canViewProjects = await canViewProjectsPromise
    const canCreateProject = await canCreateProjectPromise
    const canUpdateProject = await canUpdateProjectPromise
    const canDeleteProject = await canDeleteProjectPromise

    const hasAnyProjectPermission =
      canViewProjects || canCreateProject || canUpdateProject || canDeleteProject

    if (hasAnyProjectPermission) {
      await requireTeamAccess(ctx, {
        organizationId: team.organizationId,
        teamId: args.teamId,
        authUserId: actor.authUserId,
      })
    }

    return {
      organizationId: team.organizationId,
      teamId: args.teamId,
      canViewProjects,
      canCreateProject,
      canUpdateProject,
      canDeleteProject,
    }
  },
})

export const listMembers = query({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectTeamAccess(ctx, {
      teamId: args.teamId,
      permission: 'read',
    })

    const members = await listBetterAuthTeamMembers(ctx, args.teamId)
    return members.map((member) => ({
      id: member._id,
      teamId: member.teamId,
      userId: member.userId,
    }))
  },
})

export const resolveForManagement = query({
  args: {
    teamId: v.string(),
    permission: v.union(v.literal('update'), v.literal('delete')),
  },
  handler: async (ctx, args) => {
    const team = await getBetterAuthTeam(ctx, {
      teamId: args.teamId,
    })

    if (!team?.organizationId) {
      throw new ConvexError('Team not found')
    }

    await requireOrgMembership(ctx, {
      organizationId: team.organizationId,
    })

    const headers = await authComponent.getHeaders(ctx)
    const allowed = await hasManagementPermission(ctx, {
      headers,
      organizationId: team.organizationId,
      permission: args.permission,
    })

    if (!allowed) {
      throw new ConvexError(`Missing member:${args.permission} permission`)
    }

    return {
      organizationId: team.organizationId,
      teamId: args.teamId,
    }
  },
})
