import { deny, open } from '@lupinum/trellis/auth'

import {
  createWorkspace,
  listAccessibleWorkspaces as listAccessibleWorkspacesArgs,
  seedAgencyPortfolio,
  switchWorkspace as switchWorkspaceArgs,
} from '../../../shared/features/workspaces/contract'
import { getActor } from '../../auth/actor'
import { getMemberships, requireWorkspaceMembership } from '../../auth/agency'
import { mutation, query } from '../../functions'

async function getIdentitySubject(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> }
}) {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.subject ?? null
}

export const listAccessibleWorkspaces = query({
  args: listAccessibleWorkspacesArgs.args,
  guard: open,
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return []

    const db = ctx.db.escapeTenantIsolation({
      reason: 'Agency membership lookup spans multiple workspaces.',
    })
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

export const createWorkspaceMutation = mutation({
  args: createWorkspace.args,
  guard: open,
  handler: async (ctx, args) => {
    const subject = await getIdentitySubject(ctx)
    if (!subject) throw deny('Not authenticated.')

    const db = ctx.db.escapeTenantIsolation({
      reason: 'Workspace bootstrap must write outside the current tenant scope.',
    })
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', subject))
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

export const switchWorkspace = mutation({
  args: switchWorkspaceArgs.args,
  guard: open,
  handler: async (ctx, args) => {
    const subject = await getIdentitySubject(ctx)
    if (!subject) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', subject))
      .first()

    if (!user) throw new Error('Current user row not found.')

    await requireWorkspaceMembership(
      ctx.db.escapeTenantIsolation({
        reason: 'Workspace switching validates membership in another tenant.',
      }),
      user.authId,
      args.workspaceId,
    )

    await ctx.db.patch(user._id, {
      workspaceId: args.workspaceId,
      updatedAt: Date.now(),
    })
  },
})

export const seedAgencyPortfolioMutation = mutation({
  args: seedAgencyPortfolio.args,
  guard: open,
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) throw deny('Not authenticated.')

    const db = ctx.db.escapeTenantIsolation({
      reason: 'Agency portfolio seeding intentionally creates records across tenants.',
    })
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
