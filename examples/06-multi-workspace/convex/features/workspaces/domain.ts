import { deny } from '@lupinum/trellis/auth'

import {
  createWorkspace,
  listAccessibleWorkspaces as listAccessibleWorkspacesArgs,
  seedAgencyPortfolio,
  switchWorkspace as switchWorkspaceArgs,
} from '../../../shared/features/workspaces/contract'
import { getMemberships, requireWorkspaceMembership } from '../../auth/agency'
import { getAppIdentity } from '../../auth/appIdentity'
import { mutation, query } from '../../functions'

async function getIdentityAuthKey(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier?: string } | null> }
}) {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? null
}

export const listAccessibleWorkspaces = query.public({
  args: listAccessibleWorkspacesArgs.args,
  handler: async (ctx) => {
    const appIdentity = await getAppIdentity(ctx)
    if (!appIdentity) return []

    // This lookup crosses tenant boundaries only to resolve the caller's own memberships.
    const db = ctx.db.escapeIsolation({
      reason: 'Agency membership lookup spans multiple workspaces.',
    })
    const memberships = await getMemberships(db, appIdentity.userId)

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

export const createWorkspaceMutation = mutation.public({
  args: createWorkspace.args,
  handler: async (ctx, args) => {
    const authKey = await getIdentityAuthKey(ctx)
    if (!authKey) throw deny('Not authenticated.')

    // Workspace bootstrap is one of the few legitimate writes that must happen before the caller has
    // a current tenant.
    const db = ctx.db.escapeIsolation({
      reason: 'Workspace bootstrap must write outside the current tenant scope.',
    })
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_key', (q) => q.eq('authKey', authKey))
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
      ownerId: user._id,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert('memberships', {
      userId: user._id,
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

export const switchWorkspace = mutation.public({
  args: switchWorkspaceArgs.args,
  handler: async (ctx, args) => {
    const authKey = await getIdentityAuthKey(ctx)
    if (!authKey) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_key', (q) => q.eq('authKey', authKey))
      .first()

    if (!user) throw new Error('Current user row not found.')

    // Switching tenants validates membership in another workspace before patching the user's active
    // workspace pointer.
    await requireWorkspaceMembership(
      ctx.db.escapeIsolation({
        reason: 'Workspace switching validates membership in another tenant.',
      }),
      user._id,
      args.workspaceId,
    )

    await ctx.db.patch(user._id, {
      workspaceId: args.workspaceId,
      updatedAt: Date.now(),
    })
  },
})

export const seedAgencyPortfolioMutation = mutation.public({
  args: seedAgencyPortfolio.args,
  handler: async (ctx) => {
    const appIdentity = await getAppIdentity(ctx)
    if (!appIdentity) throw deny('Not authenticated.')

    // Demo-only seed path: intentionally creates records across several workspaces so the operator
    // dashboard has something real to show.
    const db = ctx.db.escapeIsolation({
      reason: 'Agency portfolio seeding intentionally creates records across-scopes.',
    })
    const now = Date.now()
    const clientA = await db.insert('workspaces', {
      name: 'Client A',
      slug: `client-a-${now}`,
      ownerId: appIdentity.userId,
      createdAt: now,
      updatedAt: now,
    })
    const clientB = await db.insert('workspaces', {
      name: 'Client B',
      slug: `client-b-${now}`,
      ownerId: appIdentity.userId,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert('memberships', {
      userId: appIdentity.userId,
      workspaceId: clientA,
      role: 'agency_manager',
      createdAt: now,
    })
    await db.insert('memberships', {
      userId: appIdentity.userId,
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
