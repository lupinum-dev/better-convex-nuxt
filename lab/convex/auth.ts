import { createClient, type GenericCtx, type AuthFunctions } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import { components, internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import authConfig from './auth.config'

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
          avatarUrl: doc.image ?? undefined, // Convert null to undefined
          createdAt: now,
          updatedAt: now
        })
      },
      // Sync name and email changes
      onUpdate: async (ctx, newDoc, oldDoc) => {
        const nameChanged = newDoc.name !== oldDoc.name
        const emailChanged = newDoc.email !== oldDoc.email
        const imageChanged = newDoc.image !== oldDoc.image
        if (nameChanged || emailChanged || imageChanged) {
          const user = await ctx.db
            .query('users')
            .withIndex('by_auth_id', (q) => q.eq('authId', newDoc._id))
            .first()
          if (user) {
            await ctx.db.patch(user._id, {
              ...(nameChanged && { displayName: newDoc.name }),
              ...(emailChanged && { email: newDoc.email }),
              ...(imageChanged && { avatarUrl: newDoc.image ?? undefined }),
              updatedAt: Date.now()
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
      }
    }
  }
})

// Export trigger handlers for the component
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

// Factory function to create auth instance per request
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    // GitHub OAuth only - no email/password
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!
      }
    },
    plugins: [
      // convex() plugin includes JWT functionality
      convex({ authConfig })
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24 // 1 day
    },
    trustedOrigins: [siteUrl, 'http://localhost:3000', 'http://127.0.0.1:3000']
  })
}

// ============================================
// GET PERMISSION CONTEXT
// ============================================
// Fetched once at app startup.
// Returns everything the frontend needs to check permissions.

export const getPermissionContext = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return null
    }

    // Look up user in our database
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    // User doesn't exist yet - will be created by trigger
    if (!user) {
      return null
    }

    // Return permission context
    return {
      role: user.role,
      userId: user.authId,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl
    }
  }
})

// ============================================
// SET OWN ROLE - Demo purposes only
// ============================================
// Allows users to change their own role for demo purposes

export const setOwnRole = mutation({
  args: {
    role: v.union(
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer')
    )
  },
  handler: async (ctx, { role }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (!user) {
      throw new Error('User not found')
    }

    await ctx.db.patch(user._id, {
      role,
      updatedAt: Date.now()
    })

    return { success: true, newRole: role }
  }
})

// ============================================
// GET CURRENT USER
// ============================================

export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return null
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    return user
  }
})
