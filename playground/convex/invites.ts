/**
 * Invites Module
 *
 * Invitation system with permission checks.
 */

import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import { getUser, authorize, requireUser } from './lib/permissions'
import { checkPermission } from './permissions.config'

// ============================================
// LIST PENDING INVITES
// ============================================

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx)
    if (!user) return []

    // Check permission inline (return [] not throw)
    if (!checkPermission({ role: user.role, userId: user.authId }, 'org.invite')) {
      return []
    }

    return await ctx.db
      .query('invites')
      .withIndex('by_organization', (q) => q.eq('organizationId', user.organizationId))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .order('desc')
      .collect()
  },
})

// ============================================
// CREATE INVITE
// ============================================

export const create = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    const user = await authorize(ctx, 'org.invite')

    // Business rule: only owner can invite admins
    if (args.role === 'admin' && user.role !== 'owner') {
      throw new Error('Only owner can invite admins')
    }

    // Check not already invited
    const existing = await ctx.db
      .query('invites')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .filter((q) =>
        q.and(
          q.eq(q.field('organizationId'), user.organizationId),
          q.eq(q.field('status'), 'pending'),
        ),
      )
      .first()

    if (existing) {
      throw new Error('Already invited')
    }

    // Check not already a member
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .filter((q) => q.eq(q.field('organizationId'), user.organizationId))
      .first()

    if (existingUser) {
      throw new Error('Already a member')
    }

    return await ctx.db.insert('invites', {
      email: args.email,
      role: args.role,
      organizationId: user.organizationId,
      invitedBy: user.authId,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    })
  },
})

// ============================================
// REVOKE INVITE
// ============================================

export const revoke = mutation({
  args: { id: v.id('invites') },
  handler: async (ctx, args) => {
    const user = await authorize(ctx, 'org.invite')

    const invite = await ctx.db.get(args.id)
    if (!invite) throw new Error('Invite not found')

    if (invite.organizationId !== user.organizationId) {
      throw new Error('Invite not in your organization')
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is not pending')
    }

    await ctx.db.patch(args.id, { status: 'revoked' })
  },
})

// ============================================
// ACCEPT INVITE (called by invited user)
// ============================================

export const accept = mutation({
  args: { id: v.id('invites') },
  handler: async (ctx, args) => {
    // Get current user (must be logged in)
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Unauthorized')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (!user) throw new Error('User not found')

    const invite = await ctx.db.get(args.id)
    if (!invite) throw new Error('Invite not found')

    // Must be for this user's email
    if (invite.email !== user.email) {
      throw new Error('Invite is for a different email')
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer valid')
    }

    if (invite.expiresAt < Date.now()) {
      await ctx.db.patch(args.id, { status: 'expired' })
      throw new Error('Invite has expired')
    }

    // User already in an org? (shouldn't happen, but check)
    if (user.organizationId) {
      throw new Error('You are already in an organization')
    }

    // Accept!
    await ctx.db.patch(args.id, { status: 'accepted' })
    await ctx.db.patch(user._id, {
      organizationId: invite.organizationId,
      role: invite.role,
      updatedAt: Date.now(),
    })
  },
})

// ============================================
// GET MY INVITES
// ============================================
// Get pending invites for the current user's email

export const getMyInvites = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (!user || !user.email) return []

    const userEmail = user.email
    return await ctx.db
      .query('invites')
      .withIndex('by_email', (q) => q.eq('email', userEmail))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .collect()
  },
})
