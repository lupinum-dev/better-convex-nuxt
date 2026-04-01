import { betterAuth } from 'better-auth'
import { can, defineAuth } from 'better-convex-nuxt/auth'

import { components, internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import authConfig from './auth.config'
import { getActor } from './auth/actor'
import {
  canCreateComment,
  canCreatePost,
  canInviteMembers,
  canManageMembers,
  canManageOrgSettings,
  canPublishPost,
  canReadComment,
  canReadPost,
  canViewBilling,
} from './auth/checks'

export const { authComponent, createAuth, createUserIfNeeded } = defineAuth(
  { components, internal, mutation, authConfig },
  {
    emailPassword: true,
    userFields: () => ({
      role: 'member' as const,
    }),
    custom: (_ctx, bridge) =>
      betterAuth({
        baseURL: bridge.siteUrl,
        database: bridge.database,
        secret:
          process.env.BETTER_AUTH_SECRET ?? 'local-test-better-auth-secret-not-for-production',
        emailAndPassword: {
          enabled: true,
        },
        user: {
          additionalFields: {
            organizationId: { type: 'string', required: false },
            marketingOptIn: { type: 'boolean', required: false },
          },
        },
        plugins: [
          bridge.createConvexPlugin({
            jwt: {
              definePayload: ({ user }) => ({
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                image: user.image ?? undefined,
                authId: user.id,
                role: 'member',
              }),
            },
          }),
        ],
        session: {
          expiresIn: 60 * 60 * 24 * 7,
          updateAge: 60 * 60 * 24,
        },
        trustedOrigins: bridge.trustedOrigins,
      }),
  },
)

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

export type AppAuth = ReturnType<typeof createAuth>

// ============================================
// GET PERMISSION CONTEXT
// ============================================
// Fetched once at app startup.
// Returns everything the frontend needs to check permissions.
//
// The Convex reactivity system will automatically
// re-run this if the user's role changes.

interface DebugInfo {
  hasIdentity: boolean
  identitySubject?: string
  hasUser?: boolean
  userId?: string
  tenantId?: string
  role?: string
  reason?: string
  context?: Record<string, unknown>
}

export const getPermissionContext = query({
  handler: async (ctx) => {
    // #region agent log
    const identity = await ctx.auth.getUserIdentity()
    const debugInfo: DebugInfo = { hasIdentity: !!identity, identitySubject: identity?.subject }
    // #endregion

    if (!identity) {
      return null
    }

    // Look up user in our database
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    // #region agent log
    debugInfo.hasUser = !!user
    debugInfo.userId = user?._id
    debugInfo.tenantId = user?.organizationId
    debugInfo.role = user?.role
    // #endregion

    // Missing user row means Better Auth sync has not populated the app user table yet.
    if (!user) {
      // #region agent log
      debugInfo.reason = 'user row missing after auth sync'
      // Return debug info for debugging
      return { _debug: debugInfo } as { _debug: DebugInfo }
      // #endregion
    }

    const actor = await getActor(ctx)
    if (!actor) {
      return { _debug: { ...debugInfo, reason: 'actor resolution failed' } } as {
        _debug: DebugInfo
      }
    }

    // Return permission context even if no tenant is assigned yet.
    const context: {
      role: string
      userId: string
      displayName?: string
      email?: string
      tenantId?: string
      can: Record<string, boolean>
    } = {
      role: user.role,
      userId: user.authId,
      displayName: user.displayName,
      email: user.email,
      can: {
        'org.settings': can(actor, canManageOrgSettings),
        'org.billing': can(actor, canViewBilling),
        'org.invite': can(actor, canInviteMembers),
        'org.members': can(actor, canManageMembers),
        'post.create': can(actor, canCreatePost),
        'post.read': can(actor, canReadPost),
        'post.publish': can(actor, canPublishPost),
        'comment.create': can(actor, canCreateComment),
        'comment.read': can(actor, canReadComment),
      },
    }

    // Only include tenantId if user has one
    if (user.organizationId) {
      context.tenantId = user.organizationId
    }

    // #region agent log
    debugInfo.context = context
    debugInfo.reason = user.organizationId ? 'success' : 'user has no organizationId'
    // Always attach debug info for debugging
    return { ...context, _debug: debugInfo }
    // #endregion
  },
})
