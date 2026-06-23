import { ConvexError, v } from 'convex/values'

import {
  canViewOrganizationActivity,
  isInviteRole,
  isOrganizationRole,
} from '../shared/organizationRoles'
import { mutation, query } from './_generated/server'
import {
  getAppAuth,
  hasOrganizationPermissions,
  requireAuthenticatedSession,
  requireOrgMembership,
} from './lib/authz'
import { getBetterAuthMember } from './lib/betterAuthRows'

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
  }
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return []
    }

    const { auth, headers } = await getAppAuth(ctx)
    const organizations = await auth.api.listOrganizations({ headers })

    return await Promise.all(
      organizations.map(async (organization) => {
        const member = await getBetterAuthMember(ctx, {
          organizationId: organization.id,
          userId: identity.subject,
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
      canCreateProject,
      canDeleteProject,
    ] = await Promise.all([
      hasOrganizationPermissions(auth, headers, args.organizationId, {
        organization: ['update'],
      }),
      hasOrganizationPermissions(auth, headers, args.organizationId, {
        member: ['create', 'update', 'delete'],
        invitation: ['create'],
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
      canCreateProject,
      canDeleteProject,
    }
  },
})

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await requireAuthenticatedSession(ctx)
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Organization name is required')
    }

    const organization = await auth.api.createOrganization({
      headers,
      body: {
        name,
        slug: slugify(name),
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
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Organization name is required')
    }

    const organization = await auth.api.updateOrganization({
      headers,
      body: {
        organizationId: args.organizationId,
        data: { name },
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
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Team name is required')
    }

    const team = await auth.api.createTeam({
      headers,
      body: {
        organizationId: args.organizationId,
        name,
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
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await getAppAuth(ctx)
    await requireOrgMembership(ctx, { organizationId: args.organizationId })
    const allowed = await hasOrganizationPermissions(auth, headers, args.organizationId, {
      member: ['update'],
    })
    if (!allowed) {
      throw new ConvexError('Missing member:update permission')
    }

    const result = await auth.api.listMembers({
      headers,
      query: {
        organizationId: args.organizationId,
        limit: 100,
      },
    })

    return result.members.map(memberDto)
  },
})

export const inviteMember = mutation({
  args: {
    organizationId: v.string(),
    email: v.string(),
    role: v.string(),
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await requireAuthenticatedSession(ctx)
    const email = args.email.trim()
    if (!email) {
      throw new ConvexError('Email is required')
    }
    if (!isInviteRole(args.role)) {
      throw new ConvexError('Valid role is required')
    }
    if (!args.teamId.trim()) {
      throw new ConvexError('teamId is required')
    }

    return await auth.api.createInvitation({
      headers,
      body: {
        organizationId: args.organizationId,
        email,
        role: args.role,
        teamId: args.teamId,
      },
    })
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
    if (!isOrganizationRole(args.role)) {
      throw new ConvexError('Valid role is required')
    }

    const result = await auth.api.updateMemberRole({
      headers,
      body: {
        organizationId: args.organizationId,
        memberId: args.memberId,
        role: args.role,
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
    await auth.api.removeMember({
      headers,
      body: {
        organizationId: args.organizationId,
        memberIdOrEmail: args.memberId,
      },
    })
    return { ok: true }
  },
})
