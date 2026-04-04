import { can, definePermissionContext, deny, open } from '@lupinum/trellis/auth'
/**
 * Why this file exists:
 * Current-workspace actions stay normal here. The agency dashboard lives in a separate query on purpose.
 */
import { v } from 'convex/values'

import { agencyPermissionKeys, type AgencyPermissionMap } from '../shared/permissions'
import { getActor } from './auth/actor'
import { getMemberships, requireWorkspaceMembership } from './auth/agency'
import { hasRole } from './auth/checks'
import { app, mutation } from './functions'

type Actor = NonNullable<Awaited<ReturnType<typeof getActor>>>

export const listWorkspaces = app.query({
  args: {},
  guard: open,
  handler: async (ctx) => {
    // DEMO ONLY: onboarding stays easier when example users can discover seedable workspaces.
    const workspaces = await ctx.db.query('workspaces').order('desc').collect()
    return workspaces.map(({ _id, name, slug }) => ({ _id, name, slug }))
  },
})

export const listAccessibleWorkspaces = app.query({
  args: {},
  guard: hasRole('owner', 'member', 'viewer', 'agency_admin', 'agency_manager'),
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const memberships = await getMemberships(ctx.db, actor.userId)
    return Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId)
        return {
          workspaceId: membership.workspaceId,
          role: membership.role,
          name: workspace?.name ?? membership.workspaceId,
        }
      }),
    )
  },
})

export const getPermissionContext = app.query(
  definePermissionContext({
    resolve: getActor,
    guards: {
      [agencyPermissionKeys.projectCreate]: hasRole('owner', 'member'),
      [agencyPermissionKeys.agencyDashboard]: (actor: Actor) =>
        ['agency_admin', 'agency_manager'].includes(actor.role),
    } satisfies Record<keyof AgencyPermissionMap, (actor: Actor) => boolean>,
    extend: async (ctx, actor) => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', actor.userId))
        .first()
      const memberships = await getMemberships(ctx.db, actor.userId)

      return {
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        can: {
          [agencyPermissionKeys.projectCreate]: can(actor, hasRole('owner', 'member')),
          [agencyPermissionKeys.agencyDashboard]: memberships.some((m) =>
            ['agency_admin', 'agency_manager'].includes(m.role),
          ),
        } satisfies AgencyPermissionMap,
      }
    },
  }),
)

export const createWorkspace = mutation({
  args: { name: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

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
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: user.authId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('memberships', {
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

export const joinWorkspace = mutation({
  args: {
    slug: v.string(),
    role: v.union(v.literal('member'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    const workspace = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()
    if (!workspace) throw new Error('Workspace not found.')

    const existingMembership = await ctx.db
      .query('memberships')
      .withIndex('by_user_workspace', (q) =>
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

    await ctx.db.insert('memberships', {
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

export const switchWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    await requireWorkspaceMembership(ctx.db, user.authId, args.workspaceId)
    await ctx.db.patch(user._id, {
      workspaceId: args.workspaceId,
      updatedAt: Date.now(),
    })
  },
})

export const seedAgencyPortfolio = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) throw deny('Not authenticated.')

    const now = Date.now()
    const clientA = await ctx.db.insert('workspaces', {
      name: 'Client A',
      slug: `client-a-${now}`,
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    const clientB = await ctx.db.insert('workspaces', {
      name: 'Client B',
      slug: `client-b-${now}`,
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('memberships', {
      userId: actor.userId,
      workspaceId: clientA,
      role: 'agency_manager',
      createdAt: now,
    })
    await ctx.db.insert('memberships', {
      userId: actor.userId,
      workspaceId: clientB,
      role: 'agency_manager',
      createdAt: now,
    })

    await ctx.db.insert('projects', {
      workspaceId: clientA,
      name: 'Client A campaign',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('projects', {
      workspaceId: clientB,
      name: 'Client B redesign',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    return { clientA, clientB }
  },
})
