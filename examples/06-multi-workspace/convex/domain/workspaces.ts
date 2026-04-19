import { deny, getAuth, open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { getActor } from '../auth/actor'
import { getMemberships, requireWorkspaceMembership } from '../auth/agency'
import { hasRole } from '../auth/checks'
import { mutation, query, raw } from '../functions'

function crossTenantDb<DB>(db: DB): DB {
  return (db as DB & { crossTenant: DB }).crossTenant
}

export const listWorkspaces = query({
  args: {},
  guard: open,
  handler: async (ctx) => {
    const workspaces = await ctx.db.query('workspaces').order('desc').collect()
    return workspaces.map(({ _id, name, slug }) => ({ _id, name, slug }))
  },
})

export const listAccessibleWorkspaces = raw.query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return []
    const db = crossTenantDb(ctx.db)
    const memberships = await getMemberships(db, actor.userId)
    return Promise.all(
      memberships.map(async (membership) => {
        const workspace = await db.get(membership.workspaceId)
        return {
          workspaceId: membership.workspaceId,
          role: membership.role,
          name: workspace?.name ?? String(membership.workspaceId),
        }
      }),
    )
  },
})

export const createWorkspace = raw.mutation({
  args: { name: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const identity = await getAuth(ctx)
    if (!identity) throw deny('Not authenticated.')
    const db = crossTenantDb(ctx.db)

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()
    if (existing) throw new Error('That workspace slug is already taken.')

    const now = Date.now()
    const workspaceId = await db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: user.authId,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert('memberships', {
      userId: user.authId,
      workspaceId,
      role: 'owner',
      createdAt: now,
    })

    await ctx.db.patch(user._id, {
      workspaceId,
      updatedAt: now,
    })

    return workspaceId
  },
})

export const joinWorkspace = raw.mutation({
  args: {
    slug: v.string(),
    role: v.union(
      v.literal('owner'),
      v.literal('member'),
      v.literal('viewer'),
      v.literal('agency_admin'),
      v.literal('agency_manager'),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await getAuth(ctx)
    if (!identity) throw deny('Not authenticated.')
    const db = crossTenantDb(ctx.db)

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    const workspace = await db
      .query('workspaces')
      .withIndex('by_slug', (q: any) => q.eq('slug', args.slug))
      .first()
    if (!workspace) throw new Error('Workspace not found.')

    const existingMembership = await db
      .query('memberships')
      .withIndex('by_user_workspace', (q: any) =>
        q.eq('userId', user.authId).eq('workspaceId', workspace._id),
      )
      .first()
    if (existingMembership) {
      await ctx.db.patch(user._id, {
        workspaceId: workspace._id,
        updatedAt: Date.now(),
      })
      return workspace._id
    }

    await db.insert('memberships', {
      userId: user.authId,
      workspaceId: workspace._id,
      role: args.role,
      createdAt: Date.now(),
    })

    await ctx.db.patch(user._id, {
      workspaceId: workspace._id,
      updatedAt: Date.now(),
    })

    return workspace._id
  },
})

export const switchWorkspace = raw.mutation({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    const identity = await getAuth(ctx)
    if (!identity) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    await requireWorkspaceMembership(crossTenantDb(ctx.db), user.authId, args.workspaceId)
    await ctx.db.patch(user._id, {
      workspaceId: args.workspaceId,
      updatedAt: Date.now(),
    })
  },
})

export const seedAgencyPortfolio = raw.mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) throw deny('Not authenticated.')
    const db = crossTenantDb(ctx.db)

    const now = Date.now()
    const clientA = await db.insert('workspaces', {
      name: 'Client A',
      slug: `client-a-${now}`,
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    const clientB = await db.insert('workspaces', {
      name: 'Client B',
      slug: `client-b-${now}`,
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert('memberships', {
      userId: actor.userId,
      workspaceId: clientA,
      role: 'agency_manager',
      createdAt: now,
    })
    await db.insert('memberships', {
      userId: actor.userId,
      workspaceId: clientB,
      role: 'agency_manager',
      createdAt: now,
    })

    await db.insert('projects', {
      workspaceId: clientA,
      name: 'Client A campaign',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert('projects', {
      workspaceId: clientB,
      name: 'Client B redesign',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    return { clientA, clientB }
  },
})

export const listMembers = query({
  args: {},
  guard: hasRole('owner', 'member', 'viewer', 'agency_admin', 'agency_manager'),
  handler: async (ctx) => {
    const actor = await ctx.actor()

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .collect()

    return Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', (q) => q.eq('authId', membership.userId))
          .first()
        return {
          _id: membership._id,
          userId: membership.userId,
          role: membership.role,
          displayName: user?.displayName ?? null,
          email: user?.email ?? null,
        }
      }),
    )
  },
})
