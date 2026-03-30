/**
 * Why this file exists:
 * The full example needs just enough onboarding to demonstrate tenant scoping and role-based permissions.
 * The flows here are intentionally tiny so readers can focus on the framework, not enterprise admin UX.
 */
import { v } from 'convex/values'

import {
  authedMutation,
  openQuery,
  publicQuery,
} from './functions'

const joinRoleValidator = v.union(v.literal('admin'), v.literal('member'), v.literal('viewer'))

export const listWorkspaces = publicQuery({
  args: {},
  handler: async ({ db }) => {
    return await db.query('organizations').order('desc').collect()
  },
})

export const getPermissionContext = openQuery({
  args: {},
  handler: async ({ actor, db }) => {
    if (!actor) return null

    const user = await db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', actor.userId))
      .first()

    if (!user) return null

    return {
      role: user.role,
      userId: user.authId,
      tenantId: user.organizationId,
      email: user.email,
      displayName: user.displayName,
    }
  },
})

export const createWorkspace = authedMutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async ({ db, actor }, args) => {
    const existing = await db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()

    if (existing) {
      throw new Error('That workspace slug is already taken.')
    }

    const user = await db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', actor.userId))
      .first()

    if (!user) {
      throw new Error('Current user row not found.')
    }

    const now = Date.now()
    const tenantId = await db.insert('organizations', {
      name: args.name,
      slug: args.slug,
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    // The creator becomes the owner. That keeps the example easy to reason about.
    await db.patch(user._id, {
      organizationId: tenantId,
      role: 'owner',
      updatedAt: now,
    })

    return tenantId
  },
})

export const joinWorkspace = authedMutation({
  args: {
    slug: v.string(),
    role: joinRoleValidator,
  },
  handler: async ({ db, actor }, args) => {
    const organization = await db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()

    if (!organization) {
      throw new Error('Workspace not found.')
    }

    const user = await db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', actor.userId))
      .first()

    if (!user) {
      throw new Error('Current user row not found.')
    }

    await db.patch(user._id, {
      organizationId: organization._id,
      role: args.role,
      updatedAt: Date.now(),
    })

    return organization._id
  },
})
