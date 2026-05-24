/**
 * Why this file exists:
 * Agency dashboards are the controlled exception to normal tenant scoping, so they get a
 * distinct appIdentity type and explicit membership helpers.
 */
import { deny, getAuth } from '@lupinum/trellis/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
type Db = Ctx['db']
type Membership = Doc<'memberships'>

export type AgencyActor = {
  kind: 'agency_user'
  userId: Id<'users'>
  authKey: string
}

export async function getAgencyActor(ctx: Ctx): Promise<AgencyActor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_key', (q) => q.eq('authKey', auth.authKey))
    .first()
  if (!user) return null

  return {
    kind: 'agency_user',
    userId: user._id,
    authKey: user.authKey,
  }
}

export async function getMemberships(db: Db, userId: Id<'users'>): Promise<Array<Membership>> {
  return db
    .query('memberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
}

export async function requireAnyAgencyRole(
  db: Db,
  userId: Id<'users'>,
  ...roles: Array<Membership['role']>
): Promise<void> {
  const memberships = await getMemberships(db, userId)
  if (!memberships.some((membership) => roles.includes(membership.role))) {
    throw deny('Requires agency access.')
  }
}

export async function requireWorkspaceMembership(
  db: Db,
  userId: Id<'users'>,
  workspaceId: Id<'workspaces'>,
): Promise<Membership> {
  const membership = await db
    .query('memberships')
    .withIndex('by_user_workspace', (q: any) =>
      q.eq('userId', userId).eq('workspaceId', workspaceId),
    )
    .first()

  if (!membership) throw deny('No access to this workspace.')
  return membership
}
