import { ConvexError } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

type Role = 'owner' | 'admin' | 'member' | 'viewer'

const roleRank: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1
}

export async function requireServiceActor(
  ctx: QueryCtx | MutationCtx,
  args: {
    credentialHash: string
    organizationId: Id<'organizations'>
    minimumRole?: Role
  }
) {
  const credential = await ctx.db
    .query('agentCredentials')
    .withIndex('by_secret_hash', (q) => q.eq('secretHash', args.credentialHash))
    .unique()

  if (
    !credential ||
    credential.status !== 'active' ||
    credential.organizationId !== args.organizationId
  ) {
    throw new ConvexError('Service actor credential denied')
  }

  const actor = await ctx.db.get(credential.serviceActorId)
  if (!actor || actor.status !== 'active' || actor.organizationId !== args.organizationId) {
    throw new ConvexError('Service actor denied')
  }

  const minimumRole = args.minimumRole ?? 'viewer'
  if (roleRank[actor.role as Role] < roleRank[minimumRole]) {
    throw new ConvexError('Insufficient service actor role')
  }

  return actor
}

export async function writeServiceAudit(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>
    serviceActorId: Id<'serviceActors'>
    action: string
    resourceType: string
    resourceId?: string
    result: 'allowed' | 'denied'
  }
) {
  await ctx.db.insert('auditEvents', {
    ...args,
    createdAt: Date.now()
  })
}
