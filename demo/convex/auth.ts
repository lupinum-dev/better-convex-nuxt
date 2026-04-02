import { can, defineAuth } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { components, internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import authConfig from './auth.config'
import { getActor } from './auth/actor'
import { canAdminSettings, canCreateFeed, canUploadFile, canViewAll } from './auth/checks'

export const { authComponent, createAuth, createUserIfNeeded } = defineAuth(
  { components, internal, mutation, authConfig },
  {
    emailPassword: true,
    userFields: () => ({
      role: 'member' as const,
    }),
  },
)

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

// ============================================
// GET PERMISSION CONTEXT
// ============================================
// Fetched once at app startup.
// Returns everything the frontend needs to check permissions.

export const getPermissionContext = query({
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) {
      return null
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
      .first()

    if (!user) {
      return null
    }

    return {
      role: user.role,
      userId: user.authId,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      can: {
        'admin.settings': can(actor, canAdminSettings),
        'view.all': can(actor, canViewAll),
        'feed.create': can(actor, canCreateFeed),
        'file.upload': can(actor, canUploadFile),
      },
    }
  },
})

// ============================================
// SET OWN ROLE - Demo purposes only
// ============================================
// Allows users to change their own role for demo purposes

export const setOwnRole = mutation({
  args: {
    role: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
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
      updatedAt: Date.now(),
    })

    return { success: true, newRole: role }
  },
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
  },
})
