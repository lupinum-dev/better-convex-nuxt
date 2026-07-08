import { createClient, type GenericCtx, type AuthFunctions } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { internalAction, mutation, query } from './_generated/server'
import authConfig from './auth.config'

// Get site URL from environment
const siteUrl = process.env.SITE_URL!

// Auth functions for triggers
const authFunctions: AuthFunctions = internal.auth

// Create the auth component client with triggers to sync users.
// Better Auth owns identity; this table is a rebuildable display projection.
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      // Auto-create user projection when Better Auth creates one
      onCreate: async (ctx, doc) => {
        const now = Date.now()
        await ctx.db.insert('users', {
          authId: doc._id,
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
    user: {
      // Playground-only demo field to verify Better Auth `additionalFields`
      // typing on the frontend (authClient.useSession()).
      additionalFields: {
        marketingOptIn: { type: 'boolean', required: false },
      },
    },
    plugins: [
      // convex() plugin includes JWT functionality - don't add separate jwt() plugin
      convex({
        authConfig,
        jwt: {
          definePayload: ({ user }) => ({
            // Keep the standard fields useConvexAuth() expects
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            image: user.image ?? undefined,
            // Custom claim used by the auth lab to verify runtime behavior
            authId: user.id,
          }),
        },
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: [siteUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  })
}

// Type-only bridge for frontend `inferAdditionalFields<AppAuth>()` usage.
export type AppAuth = ReturnType<typeof createAuth>

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
// Called by createPermissions() on the frontend. Returns the minimal
// signed-in context (the user's authId) or null when signed out. Matches
// the strict createPermissions query type: no args, returns TContext | null.
//
// This playground does not enable the Better Auth Organization plugin, so
// there is no role/org to return — the demo gates on signed-in + ownership.
// For the full role model, read role/membership from Better Auth (see docs).

export const getPermissionContext = query({
  args: {},
  handler: async (ctx): Promise<{ role: string; userId: string } | null> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return null
    }

    // `role` is a static placeholder — the playground has no org plugin. In a
    // real app, read the role from Better Auth (member row / hasPermission).
    return { role: 'member', userId: identity.subject }
  },
})

// Public mutation to create the user projection on-demand (idempotent).
// Called by the frontend when a user exists in Better Auth but the trigger
// projection has not landed yet.
export const createUserIfNeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const existing = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (existing) {
      return existing._id
    }

    const now = Date.now()
    const userId = await ctx.db.insert('users', {
      authId: identity.subject,
      displayName: identity.name,
      email: identity.email,
      createdAt: now,
      updatedAt: now,
    })

    return userId
  },
})
