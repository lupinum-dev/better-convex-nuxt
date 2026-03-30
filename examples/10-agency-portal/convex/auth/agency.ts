import { getIdentity, deny } from 'better-convex-nuxt/auth'

export async function getAgencyActor(ctx: any) {
  const identity = await getIdentity(ctx)
  if (!identity) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', identity.subject))
    .first()
  if (!user) return null

  return {
    kind: 'user' as const,
    userId: user.authId,
  }
}

export async function getMemberships(db: any, userId: string) {
  return db
    .query('memberships')
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .collect()
}

export async function requireAgencyRole(db: any, userId: string, ...roles: string[]) {
  const memberships = await getMemberships(db, userId)
  if (!memberships.some((membership: any) => roles.includes(membership.role))) {
    throw deny('Requires agency access.')
  }
}

export async function requireWorkspaceMembership(db: any, userId: string, workspaceId: string) {
  const membership = await db
    .query('memberships')
    .withIndex('by_user_workspace', (q: any) => q.eq('userId', userId).eq('workspaceId', workspaceId))
    .first()

  if (!membership) throw deny('No access to this workspace.')
  return membership
}
