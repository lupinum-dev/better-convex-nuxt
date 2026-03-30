/**
 * Why this file exists:
 * This example keeps onboarding tiny so readers can reach the advanced board patterns quickly.
 * Workspaces only handle membership, permission context, and the owner bootstrap flow.
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
    return await db.query('workspaces').order('desc').collect()
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
      tenantId: user.workspaceId,
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
      .query('workspaces')
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
    const workspaceId = await db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    await db.patch(user._id, {
      workspaceId,
      role: 'owner',
      updatedAt: now,
    })

    return workspaceId
  },
})

export const joinWorkspace = authedMutation({
  args: {
    slug: v.string(),
    role: joinRoleValidator,
  },
  handler: async ({ db, actor }, args) => {
    const workspace = await db
      .query('workspaces')
      .withIndex('by_slug', q => q.eq('slug', args.slug))
      .first()

    if (!workspace) {
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
      workspaceId: workspace._id,
      role: args.role,
      updatedAt: Date.now(),
    })

    return workspace._id
  },
})
