import { getAuth, deny } from 'better-convex-nuxt/auth'
/**
 * Why this file exists:
 * Agency dashboards are the controlled exception to normal tenant scoping, so they get a
 * distinct actor type and explicit membership helpers.
 */
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
type Db = Ctx['db']
type Membership = Doc<'memberships'>

export type AgencyActor = {
  kind: 'agency_user'
  userId: string
}

export async function getAgencyActor(ctx: Ctx): Promise<AgencyActor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
    .first()
  if (!user) return null

  return {
    kind: 'agency_user',
    userId: user.authId,
  }
}

export async function getMemberships(db: Db, userId: string): Promise<Array<Membership>> {
  return db
    .query('memberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
}

export async function requireAnyAgencyRole(
  db: Db,
  userId: string,
  ...roles: Array<Membership['role']>
): Promise<void> {
  const memberships = await getMemberships(db, userId)
  if (!memberships.some((membership) => roles.includes(membership.role))) {
    throw deny('Requires agency access.')
  }
}

export async function requireWorkspaceMembership(
  db: Db,
  userId: string,
  workspaceId: Id<'workspaces'>,
): Promise<Membership> {
  const membership = await db
    .query('memberships')
    .withIndex('by_user_workspace', (q) => q.eq('userId', userId).eq('workspaceId', workspaceId))
    .first()

  if (!membership) throw deny('No access to this workspace.')
  return membership
}
