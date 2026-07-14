import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import {
  cancelInvitationInputSchema,
  changeMemberRoleInputSchema,
  createOrganizationInputSchema,
  createTeamInputSchema,
  inviteMemberInputSchema,
  removeMemberInputSchema,
  renameOrganizationInputSchema,
} from '../shared/inputSchemas'
import {
  canViewOrganizationActivity,
  isInviteRole,
  isOrganizationRole,
} from '../shared/organizationRoles'
import { mutation, query } from './_generated/server'
import {
  getAppAuth,
  getAuthenticatedSessionOrNull,
  hasOrganizationPermissions,
  requireAuthenticatedSession,
  requireOrgMembership,
} from './lib/authz'
import {
  getBetterAuthMember,
  getBetterAuthPendingInvitationByEmail,
  getBetterAuthTeam,
  listBetterAuthOrganizationInvitationsPage,
  listBetterAuthOrganizationMembersPage,
} from './lib/betterAuthRows'
import { requireBoundedPageSize } from './lib/pagination'
import { organizationActorRateLimitKey, rateLimiter } from './lib/rateLimits'
import { parseWithConvexError } from './lib/validation'

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'organization'}-${Date.now().toString(36)}`
}

function memberDto(member: {
  id: string
  organizationId: string
  userId: string
  role: string
  user?: {
    id: string
    email: string
    name: string
    image?: string
  }
  isTeamMember?: boolean
}) {
  if (!isOrganizationRole(member.role)) {
    throw new ConvexError('Member response had an invalid role')
  }

  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    role: member.role,
    user: member.user,
    isTeamMember: member.isTeamMember ?? false,
  }
}

function invitationDto(invitation: {
  email: string
  role?: string | null
  teamId?: string
  teamName?: string
  status: string
  expiresAt: number
  createdAt: number
}) {
  if (!isInviteRole(invitation.role)) {
    throw new ConvexError('Invitation response had an invalid role')
  }

  return {
    email: invitation.email,
    role: invitation.role,
    teamId: invitation.teamId,
    teamName: invitation.teamName,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  }
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const authState = await getAuthenticatedSessionOrNull(ctx)
    if (!authState) return []

    const { auth, headers, actor } = authState
    const organizations = await auth.api.listOrganizations({ headers })

    return await Promise.all(
      organizations.map(async (organization) => {
        const member = await getBetterAuthMember(ctx, {
          organizationId: organization.id,
          userId: actor.authUserId,
        })

        return {
          id: organization.id,
          name: organization.name,
          role: isOrganizationRole(member?.role) ? member.role : null,
        }
      }),
    )
  },
})

export const getCapabilities = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers, actor } = await requireAuthenticatedSession(ctx)
    const member = await getBetterAuthMember(ctx, {
      organizationId: args.organizationId,
      userId: actor.authUserId,
    })

    if (!member || !isOrganizationRole(member.role)) {
      throw new ConvexError('User is not an organization member')
    }

    const [
      canManageOrganization,
      canManageMembers,
      canManageTeams,
      canCreateProjectPermission,
      canDeleteProject,
    ] = await Promise.all([
      hasOrganizationPermissions(auth, headers, args.organizationId, {
        organization: ['update'],
      }),
      hasOrganizationPermissions(auth, headers, args.organizationId, {
        member: ['create', 'update', 'delete'],
      }),
      hasOrganizationPermissions(auth, headers, args.organizationId, {
        team: ['create', 'update'],
      }),
      hasOrganizationPermissions(auth, headers, args.organizationId, {
        project: ['create'],
      }),
      hasOrganizationPermissions(auth, headers, args.organizationId, {
        project: ['delete'],
      }),
    ])

    return {
      role: member.role,
      canManageOrganization,
      canManageMembers,
      canManageTeams,
      canViewOrgActivity: canViewOrganizationActivity(member.role),
      canCreateProject: canCreateProjectPermission,
      canDeleteProject,
    }
  },
})

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers, actor } = await requireAuthenticatedSession(ctx)
    const input = parseWithConvexError(createOrganizationInputSchema, args)
    await rateLimiter.limit(ctx, 'organizationCreate', {
      key: actor.authUserId,
      throws: true,
    })

    const organization = await auth.api.createOrganization({
      headers,
      body: {
        name: input.name,
        slug: slugify(input.name),
      },
    })

    return {
      id: organization.id,
      name: organization.name,
    }
  },
})

export const rename = mutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await requireAuthenticatedSession(ctx)
    const input = parseWithConvexError(renameOrganizationInputSchema, args)

    const organization = await auth.api.updateOrganization({
      headers,
      body: {
        organizationId: input.organizationId,
        data: { name: input.name },
      },
    })
    if (!organization) {
      throw new ConvexError('Organization not found')
    }

    return {
      id: organization.id,
      name: organization.name,
    }
  },
})

export const listTeams = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await getAppAuth(ctx)
    await requireOrgMembership(ctx, { organizationId: args.organizationId })

    const canManageTeams = await hasOrganizationPermissions(auth, headers, args.organizationId, {
      team: ['create', 'update'],
    })

    const teams = canManageTeams
      ? await auth.api.listOrganizationTeams({
          headers,
          query: { organizationId: args.organizationId },
        })
      : await auth.api.listUserTeams({ headers })

    return teams
      .filter((team) => team.organizationId === args.organizationId)
      .map((team) => ({
        id: team.id,
        name: team.name,
        organizationId: team.organizationId,
      }))
  },
})

export const createTeam = mutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await requireAuthenticatedSession(ctx)
    const input = parseWithConvexError(createTeamInputSchema, args)

    const team = await auth.api.createTeam({
      headers,
      body: {
        organizationId: input.organizationId,
        name: input.name,
      },
    })

    return {
      id: team.id,
      name: team.name,
      organizationId: team.organizationId,
    }
  },
})

export const listMembers = query({
  args: {
    organizationId: v.string(),
    teamId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    requireBoundedPageSize(args.paginationOpts.numItems)
    const { auth, headers } = await getAppAuth(ctx)
    await requireOrgMembership(ctx, { organizationId: args.organizationId })
    const allowed = await hasOrganizationPermissions(auth, headers, args.organizationId, {
      member: ['update'],
    })
    if (!allowed) {
      throw new ConvexError('Missing member:update permission')
    }

    if (args.teamId) {
      const team = await getBetterAuthTeam(ctx, { teamId: args.teamId })
      if (team?.organizationId !== args.organizationId) {
        throw new ConvexError('Team not found')
      }
    }

    const members = await listBetterAuthOrganizationMembersPage(ctx, args)
    return {
      ...members,
      page: members.page.map(memberDto),
    }
  },
})

export const listInvitations = query({
  args: {
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    requireBoundedPageSize(args.paginationOpts.numItems)
    const { auth, headers } = await getAppAuth(ctx)
    await requireOrgMembership(ctx, { organizationId: args.organizationId })
    const allowed = await hasOrganizationPermissions(auth, headers, args.organizationId, {
      member: ['update'],
    })
    if (!allowed) {
      throw new ConvexError('Missing member:update permission')
    }

    const invitations = await listBetterAuthOrganizationInvitationsPage(
      ctx,
      args.organizationId,
      args.paginationOpts,
    )
    return {
      ...invitations,
      page: invitations.page.map(invitationDto),
    }
  },
})

export const inviteMember = mutation({
  args: {
    organizationId: v.string(),
    email: v.string(),
    role: v.string(),
    teamId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { auth, headers, actor } = await requireAuthenticatedSession(ctx)
    const input = parseWithConvexError(inviteMemberInputSchema, {
      ...args,
      teamId: args.teamId?.trim() || undefined,
    })
    await rateLimiter.limit(ctx, 'inviteMember', {
      key: organizationActorRateLimitKey(input.organizationId, actor.authUserId),
      throws: true,
    })

    await auth.api.createInvitation({
      headers,
      body: {
        organizationId: input.organizationId,
        email: input.email,
        role: input.role,
        ...(input.teamId ? { teamId: input.teamId } : {}),
      },
    })

    return { ok: true }
  },
})

export const cancelInvitation = mutation({
  args: {
    organizationId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await requireAuthenticatedSession(ctx)
    const input = parseWithConvexError(cancelInvitationInputSchema, args)
    await requireOrgMembership(ctx, { organizationId: input.organizationId })
    const allowed = await hasOrganizationPermissions(auth, headers, input.organizationId, {
      member: ['update'],
    })
    if (!allowed) {
      throw new ConvexError('Missing member:update permission')
    }
    const invitation = await getBetterAuthPendingInvitationByEmail(ctx, {
      organizationId: input.organizationId,
      email: input.email,
    })

    if (!invitation) {
      return { ok: true }
    }

    const invitationId = invitation.id ?? invitation._id
    if (!invitationId) {
      throw new ConvexError('Invitation row is missing an id')
    }

    await auth.api.cancelInvitation({
      headers,
      body: {
        invitationId,
      },
    })

    return { ok: true }
  },
})

export const changeMemberRole = mutation({
  args: {
    organizationId: v.string(),
    memberId: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await requireAuthenticatedSession(ctx)
    const input = parseWithConvexError(changeMemberRoleInputSchema, args)

    const result = await auth.api.updateMemberRole({
      headers,
      body: {
        organizationId: input.organizationId,
        memberId: input.memberId,
        role: input.role,
      },
    })

    return memberDto(result)
  },
})

export const removeMember = mutation({
  args: {
    organizationId: v.string(),
    memberId: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await requireAuthenticatedSession(ctx)
    const input = parseWithConvexError(removeMemberInputSchema, args)
    await auth.api.removeMember({
      headers,
      body: {
        organizationId: input.organizationId,
        memberIdOrEmail: input.memberId,
      },
    })
    return { ok: true }
  },
})
