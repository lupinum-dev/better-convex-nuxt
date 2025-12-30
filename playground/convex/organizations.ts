/**
 * Organizations Module
 *
 * Organization management with permission checks.
 */

import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import { getUser, authorize, requireUser } from './lib/permissions'
import { checkPermission, type PermissionContext } from './permissions.config'

// ============================================
// GET CURRENT ORG
// ============================================

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx)
    if (!user) return null

    return await ctx.db.get(user.organizationId)
  },
})

// ============================================
// LIST ALL ORGANIZATIONS
// ============================================
// Get all organizations (for browsing/joining)

export const list = query({
  args: {},
  handler: async (ctx) => {
    // Anyone can see the list of organizations
    return await ctx.db.query('organizations').order('desc').collect()
  },
})

// ============================================
// CREATE ORGANIZATION
// ============================================
// Creates a new organization and makes the user the owner.
// Used during onboarding.

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    // Must be authenticated (no org required yet)
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Unauthorized')

    // Check slug is unique
    const existing = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (existing) {
      throw new Error('Organization slug already exists')
    }

    // Create org
    const orgId = await ctx.db.insert('organizations', {
      name: args.name,
      slug: args.slug,
      ownerId: identity.subject,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // Update user to be owner of new org
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (user) {
      await ctx.db.patch(user._id, {
        organizationId: orgId,
        role: 'owner',
        updatedAt: Date.now(),
      })
    }

    return orgId
  },
})

// ============================================
// UPDATE SETTINGS (owner only)
// ============================================

export const updateSettings = mutation({
  args: {
    name: v.optional(v.string()),
    billingEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Global permission - no resource needed
    const user = await authorize(ctx, 'org.settings')

    await ctx.db.patch(user.organizationId, {
      ...(args.name && { name: args.name }),
      ...(args.billingEmail && { billingEmail: args.billingEmail }),
      updatedAt: Date.now(),
    })
  },
})

// ============================================
// GET BY IDS
// ============================================
// Get organizations by their IDs (for invite display)

export const getByIds = query({
  args: {
    ids: v.array(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const orgs = await Promise.all(args.ids.map((id) => ctx.db.get(id)))
    return orgs.filter((org): org is NonNullable<typeof org> => org !== null)
  },
})

// ============================================
// GET MEMBERS (admin+)
// ============================================

export const getMembers = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx)
    if (!user) return []

    // Check permission inline (return [] instead of throwing)
    const canView = checkPermission({ role: user.role, userId: user.authId }, 'org.members')
    if (!canView) return []

    return await ctx.db
      .query('users')
      .withIndex('by_organization', (q) => q.eq('organizationId', user.organizationId))
      .collect()
  },
})

// ============================================
// CHANGE MEMBER ROLE (owner only for admin promotions)
// ============================================

export const changeMemberRole = mutation({
  args: {
    userId: v.id('users'),
    newRole: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    // Must have org.members permission
    const currentUser = await authorize(ctx, 'org.members')

    // Get target user
    const targetUser = await ctx.db.get(args.userId)
    if (!targetUser) throw new Error('User not found')

    // Must be same org
    if (targetUser.organizationId !== currentUser.organizationId) {
      throw new Error('User not in your organization')
    }

    // Can't change owner's role
    if (targetUser.role === 'owner') {
      throw new Error("Cannot change owner's role")
    }

    // Only owner can promote to admin
    if (args.newRole === 'admin' && currentUser.role !== 'owner') {
      throw new Error('Only owner can promote to admin')
    }

    await ctx.db.patch(args.userId, {
      role: args.newRole,
      updatedAt: Date.now(),
    })
  },
})

// ============================================
// REMOVE MEMBER
// ============================================

export const removeMember = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const currentUser = await authorize(ctx, 'org.members')

    const targetUser = await ctx.db.get(args.userId)
    if (!targetUser) throw new Error('User not found')

    if (targetUser.organizationId !== currentUser.organizationId) {
      throw new Error('User not in your organization')
    }

    // Can't remove yourself (use leaveOrganization instead)
    if (targetUser._id === currentUser._id) {
      throw new Error('Cannot remove yourself - use Leave Organization instead')
    }

    // Can't remove owner
    if (targetUser.role === 'owner') {
      throw new Error('Cannot remove owner')
    }

    // Admins can't remove other admins (only owner can)
    if (targetUser.role === 'admin' && currentUser.role !== 'owner') {
      throw new Error('Only owner can remove admins')
    }

    // Remove from org (don't delete user)
    await ctx.db.patch(args.userId, {
      organizationId: undefined,
      role: 'member', // Reset to default role
      updatedAt: Date.now(),
    })
  },
})

// ============================================
// LEAVE ORGANIZATION
// ============================================
// Allows a user to leave their current organization.
// Owner cannot leave (must transfer ownership first).

export const leave = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)

    // Owner cannot leave - must transfer ownership first
    if (user.role === 'owner') {
      throw new Error('Owner cannot leave organization. Transfer ownership first.')
    }

    // Remove from org
    await ctx.db.patch(user._id, {
      organizationId: undefined,
      role: 'member', // Reset to default role
      updatedAt: Date.now(),
    })
  },
})
