import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireAuthenticatedSession } from './lib/authz'
import {
  getBetterAuthInvitation,
  getBetterAuthOrganization,
  getBetterAuthTeam,
} from './lib/betterAuthRows'

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? ''
}

async function loadInvitationForSession(
  ctx: Parameters<typeof requireAuthenticatedSession>[0],
  invitationId: string,
) {
  const authState = await requireAuthenticatedSession(ctx)
  const invitation = await getBetterAuthInvitation(ctx, { invitationId })
  if (!invitation) {
    throw new ConvexError('Invitation not found')
  }

  const sessionEmail = normalizeEmail(authState.session.user.email)
  if (!sessionEmail) {
    throw new ConvexError('Authenticated session is missing an email address')
  }
  if (!authState.session.user.emailVerified) {
    throw new ConvexError('Verify your email before using invitation links')
  }
  if (normalizeEmail(invitation.email) !== sessionEmail) {
    throw new ConvexError('Invitation is for a different email address')
  }

  return {
    ...authState,
    invitation,
  }
}

export const get = query({
  args: {
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { invitation } = await loadInvitationForSession(ctx, args.invitationId)
    const [organization, team] = await Promise.all([
      getBetterAuthOrganization(ctx, { organizationId: invitation.organizationId }),
      invitation.teamId ? getBetterAuthTeam(ctx, { teamId: invitation.teamId }) : null,
    ])

    return {
      id: invitation.id ?? invitation._id ?? args.invitationId,
      organizationId: invitation.organizationId,
      organizationName: organization?.name ?? 'Organization',
      email: invitation.email,
      role: invitation.role ?? 'member',
      teamId: invitation.teamId ?? undefined,
      teamName: team?.name,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    }
  },
})

export const accept = mutation({
  args: {
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers, invitation } = await loadInvitationForSession(ctx, args.invitationId)
    if (invitation.status !== 'pending') {
      throw new ConvexError('Invitation is no longer pending')
    }

    await auth.api.acceptInvitation({
      headers,
      body: {
        invitationId: args.invitationId,
      },
    })

    return {
      ok: true,
      organizationId: invitation.organizationId,
    }
  },
})

export const reject = mutation({
  args: {
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers, invitation } = await loadInvitationForSession(ctx, args.invitationId)
    if (invitation.status !== 'pending') {
      throw new ConvexError('Invitation is no longer pending')
    }

    await auth.api.rejectInvitation({
      headers,
      body: {
        invitationId: args.invitationId,
      },
    })

    return { ok: true }
  },
})
