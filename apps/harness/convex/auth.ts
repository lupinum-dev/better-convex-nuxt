import { can, defineBetterAuth } from '@lupinum/trellis/auth'
import type { BetterAuthPlugin } from 'better-auth'
import { betterAuth } from 'better-auth'

import { components, internal } from './_generated/api'
import { mutation } from './_generated/server'
import authConfig from './auth.config'
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
import { query } from './functions'

export const { authComponent, createAuth, createUserIfNeeded } = defineBetterAuth(
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
              definePayload: ({
                user,
              }: {
                user: {
                  name: string
                  email: string
                  emailVerified: boolean
                  image?: string | null
                  id: string
                }
              }) => ({
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                image: user.image ?? undefined,
                role: 'member',
              }),
            },
          }) as BetterAuthPlugin,
        ],
        session: {
          expiresIn: 60 * 60 * 24 * 7,
          updateAge: 60 * 60 * 24,
        },
        trustedOrigins: bridge.trustedOrigins,
      }),
  },
)

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
  workspaceId?: string
  role?: string
  reason?: string
  context?: Record<string, unknown>
}

export const getAccessContext = query.public({
  args: {},
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
      .withIndex('by_auth_key', (q) => q.eq('authKey', identity.tokenIdentifier))
      .first()

    // #region agent log
    debugInfo.hasUser = !!user
    debugInfo.userId = user?._id
    debugInfo.workspaceId = user?.organizationId
    debugInfo.role = user?.role
    // #endregion

    // Missing user row means the Trellis auth bootstrap has not populated the app user table yet.
    if (!user) {
      // #region agent log
      debugInfo.reason = 'user row missing after auth sync'
      // Return debug info for debugging
      return { _debug: debugInfo } as { _debug: DebugInfo }
      // #endregion
    }

    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) {
      return { _debug: { ...debugInfo, reason: 'appIdentity resolution failed' } } as {
        _debug: DebugInfo
      }
    }

    // Return permission context even if no tenant is assigned yet.
    const context: {
      role: string
      userId: string
      authKey: string
      displayName?: string
      email?: string
      workspaceId?: string
      can: Record<string, boolean>
    } = {
      role: user.role,
      userId: user._id,
      authKey: user.authKey,
      displayName: user.displayName,
      email: user.email,
      can: {
        'org.settings': can(appIdentity, canManageOrgSettings),
        'org.billing': can(appIdentity, canViewBilling),
        'org.invite': can(appIdentity, canInviteMembers),
        'org.members': can(appIdentity, canManageMembers),
        'post.create': can(appIdentity, canCreatePost),
        'post.read': can(appIdentity, canReadPost),
        'post.publish': can(appIdentity, canPublishPost),
        'comment.create': can(appIdentity, canCreateComment),
        'comment.read': can(appIdentity, canReadComment),
      },
    }

    // Only include workspaceId if user has one
    if (user.organizationId) {
      context.workspaceId = user.organizationId
    }

    // #region agent log
    debugInfo.context = context
    debugInfo.reason = user.organizationId ? 'success' : 'user has no organizationId'
    // Always attach debug info for debugging
    return { ...context, _debug: debugInfo }
    // #endregion
  },
})
