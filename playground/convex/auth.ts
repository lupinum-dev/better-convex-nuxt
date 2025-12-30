import { createClient, type GenericCtx, type AuthFunctions } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'

import type { DataModel } from './_generated/dataModel'

import { components, internal } from './_generated/api'
import { internalAction, mutation, query } from './_generated/server'
import authConfig from './auth.config'
import { getUser, buildPermissionContext } from './lib/permissions'

// Get site URL from environment
const siteUrl = process.env.SITE_URL!

// Auth functions for triggers
const authFunctions: AuthFunctions = internal.auth

// Create the auth component client with triggers to sync users
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      // Auto-create user in our table when Better Auth creates one
      onCreate: async (ctx, doc) => {
        const now = Date.now()
        await ctx.db.insert('users', {
          authId: doc._id,
          role: 'member', // Default role for new users
          displayName: doc.name,
          email: doc.email,
          createdAt: now,
          updatedAt: now,
        })
      },
      // Sync name and email changes
      onUpdate: async (ctx, newDoc, oldDoc) => {
        const nameChanged = newDoc.name !== oldDoc.name
        const emailChanged = newDoc.email !== oldDoc.email
        if (nameChanged || emailChanged) {
          const user = await ctx.db
            .query('users')
            .withIndex('by_auth_id', (q) => q.eq('authId', newDoc._id))
            .first()
          if (user) {
            await ctx.db.patch(user._id, {
              ...(nameChanged && { displayName: newDoc.name }),
              ...(emailChanged && { email: newDoc.email }),
              updatedAt: Date.now(),
            })
          }
        }
      },
      // Delete from our table when auth user is deleted
      onDelete: async (ctx, doc) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', (q) => q.eq('authId', doc._id))
          .first()
        if (user) {
          await ctx.db.delete(user._id)
        }
      },
    },
  },
})

// Export trigger handlers for the component
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

// Factory function to create auth instance per request
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      // convex() plugin includes JWT functionality - don't add separate jwt() plugin
      convex({ authConfig }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: [siteUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  })
}

export const rotateKeys = internalAction({
  args: {},
  handler: async (ctx) => {
    const auth = createAuth(ctx)
    const result = await auth.api.rotateKeys()
    return result
  },
})

// ============================================
// GET PERMISSION CONTEXT
// ============================================
// Fetched once at app startup.
// Returns everything the frontend needs to check permissions.
//
// The Convex reactivity system will automatically
// re-run this if the user's role changes.

// Public mutation to create user on-demand (idempotent)
// Called by frontend when user exists in Better Auth but not in our DB
export const createUserIfNeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    // Check if user already exists
    const existing = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (existing) {
      return existing._id
    }

    // Create user with default role 'member' (no org yet)
    const now = Date.now()
    const userId = await ctx.db.insert('users', {
      authId: identity.subject,
      role: 'member',
      displayName: identity.name,
      email: identity.email,
      createdAt: now,
      updatedAt: now,
    })

    return userId
  },
})

export const getPermissionContext = query({
  handler: async (ctx) => {
    // #region agent log
    const identity = await ctx.auth.getUserIdentity()
    const debugInfo: any = { hasIdentity: !!identity, identitySubject: identity?.subject }
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
    debugInfo.orgId = user?.organizationId
    debugInfo.role = user?.role
    // #endregion

    // User doesn't exist - frontend will create them via mutation
    if (!user) {
      // #region agent log
      debugInfo.reason = 'user not found in DB, needs to be created'
      // Return debug info for debugging
      return { _debug: debugInfo } as any
      // #endregion
    }

    // Return permission context (even if no orgId - frontend will handle that)
    // If user has no orgId, return partial context so frontend can show create org form
    const context: any = {
      role: user.role,
      userId: user.authId,
      displayName: user.displayName,
      email: user.email,
    }

    // Only include orgId if user has one
    if (user.organizationId) {
      context.orgId = user.organizationId
    }

    // #region agent log
    debugInfo.context = context
    debugInfo.reason = user.organizationId ? 'success' : 'user has no organizationId'
    // Always attach debug info for debugging
    return { ...context, _debug: debugInfo } as any
    // #endregion
  },
})
