import { ConvexError, v } from 'convex/values'

import { canViewOrganizationActivity } from '../shared/organizationRoles'
import { query } from './_generated/server'
import { authComponent, createAuth, type AppAuth } from './auth'
import { requireAuthenticatedUser } from './lib/authz'
import { getBetterAuthMember } from './lib/betterAuthRows'

type HasPermissionArgs = Parameters<AppAuth['api']['hasPermission']>[0]

async function hasPermission(auth: AppAuth, args: HasPermissionArgs) {
  const result = await auth.api.hasPermission(args)
  return result.success
}

export const getCapabilities = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedUser(ctx)
    const member = await getBetterAuthMember(ctx, {
      organizationId: args.organizationId,
      userId: actor.authUserId,
    })

    if (!member) {
      throw new ConvexError('User is not an organization member')
    }

    const headers = await authComponent.getHeaders(ctx)
    const auth = createAuth(ctx)
    const canManageOrganizationPromise = hasPermission(auth, {
      headers,
      body: {
        organizationId: args.organizationId,
        permissions: {
          organization: ['update'],
        },
      },
    })
    const canManageMembersPromise = hasPermission(auth, {
      headers,
      body: {
        organizationId: args.organizationId,
        permissions: {
          member: ['create', 'update', 'delete'],
          invitation: ['create'],
        },
      },
    })
    const canManageTeamsPromise = hasPermission(auth, {
      headers,
      body: {
        organizationId: args.organizationId,
        permissions: {
          team: ['create', 'update'],
        },
      },
    })
    const canCreateProjectPromise = hasPermission(auth, {
      headers,
      body: {
        organizationId: args.organizationId,
        permissions: {
          project: ['create'],
        },
      },
    })
    const canDeleteProjectPromise = hasPermission(auth, {
      headers,
      body: {
        organizationId: args.organizationId,
        permissions: {
          project: ['delete'],
        },
      },
    })

    await Promise.all([
      canManageOrganizationPromise,
      canManageMembersPromise,
      canManageTeamsPromise,
      canCreateProjectPromise,
      canDeleteProjectPromise,
    ])
    const canManageOrganization = await canManageOrganizationPromise
    const canManageMembers = await canManageMembersPromise
    const canManageTeams = await canManageTeamsPromise
    const canCreateProject = await canCreateProjectPromise
    const canDeleteProject = await canDeleteProjectPromise

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
