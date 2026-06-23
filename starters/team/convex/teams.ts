import { ConvexError, v } from 'convex/values'

import { query, mutation } from './_generated/server'
import {
  getAppAuth,
  hasOrganizationPermissions,
  requireAuthenticatedSession,
  requireOrgMembership,
  requireTeamAccess,
} from './lib/authz'
import { getBetterAuthTeam, listBetterAuthTeamMembers } from './lib/betterAuthRows'

export const getCapabilities = query({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const team = await getBetterAuthTeam(ctx, { teamId: args.teamId })
    if (!team?.organizationId) {
      throw new ConvexError('Team not found')
    }

    const { auth, headers, actor } = await requireAuthenticatedSession(ctx)
    await requireOrgMembership(ctx, {
      organizationId: team.organizationId,
    })

    const [canViewProjects, canCreateProject, canUpdateProject, canDeleteProject] =
      await Promise.all([
        hasOrganizationPermissions(auth, headers, team.organizationId, {
          project: ['read'],
        }),
        hasOrganizationPermissions(auth, headers, team.organizationId, {
          project: ['create'],
        }),
        hasOrganizationPermissions(auth, headers, team.organizationId, {
          project: ['update'],
        }),
        hasOrganizationPermissions(auth, headers, team.organizationId, {
          project: ['delete'],
        }),
      ])

    if (canViewProjects || canCreateProject || canUpdateProject || canDeleteProject) {
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

export const rename = mutation({
  args: {
    teamId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await requireAuthenticatedSession(ctx)
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Team name is required')
    }

    const existingTeam = await getBetterAuthTeam(ctx, { teamId: args.teamId })
    if (!existingTeam?.organizationId) {
      throw new ConvexError('Team not found')
    }

    const team = await auth.api.updateTeam({
      headers,
      body: {
        teamId: args.teamId,
        data: {
          name,
          organizationId: existingTeam.organizationId,
        },
      },
    })
    if (!team) {
      throw new ConvexError('Team not found')
    }

    return {
      id: team.id,
      name: team.name,
      organizationId: team.organizationId,
    }
  },
})

export const listMemberIds = query({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const team = await getBetterAuthTeam(ctx, { teamId: args.teamId })
    if (!team?.organizationId) {
      throw new ConvexError('Team not found')
    }

    const { auth, headers } = await getAppAuth(ctx)
    const { actor } = await requireOrgMembership(ctx, {
      organizationId: team.organizationId,
    })
    const allowed = await hasOrganizationPermissions(auth, headers, team.organizationId, {
      member: ['update'],
    })
    if (!allowed) {
      throw new ConvexError('Missing member:update permission')
    }
    await requireTeamAccess(ctx, {
      organizationId: team.organizationId,
      teamId: args.teamId,
      authUserId: actor.authUserId,
    })

    const members = await listBetterAuthTeamMembers(ctx, args.teamId)
    return members.map((member) => member.userId)
  },
})

export const addMember = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const team = await getBetterAuthTeam(ctx, { teamId: args.teamId })
    if (!team?.organizationId) {
      throw new ConvexError('Team not found')
    }

    const { auth, headers } = await requireAuthenticatedSession(ctx)
    const result = await auth.api.addTeamMember({
      headers,
      body: {
        organizationId: team.organizationId,
        teamId: args.teamId,
        userId: args.userId.trim(),
      },
    })

    return result.userId
  },
})

export const removeMember = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const team = await getBetterAuthTeam(ctx, { teamId: args.teamId })
    if (!team?.organizationId) {
      throw new ConvexError('Team not found')
    }

    const { auth, headers } = await requireAuthenticatedSession(ctx)
    await auth.api.removeTeamMember({
      headers,
      body: {
        organizationId: team.organizationId,
        teamId: args.teamId,
        userId: args.userId.trim(),
      },
    })

    return { ok: true }
  },
})
