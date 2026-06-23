import { ConvexError } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { requireCurrentUser } from './users'

type HumanRole = 'owner' | 'admin' | 'member' | 'viewer'
type ServiceActorRole = 'admin' | 'member' | 'viewer'
type ServiceAuditAction = 'projects.create' | 'projects.delete'
type ServiceAuditResourceType = 'project'

const roleRank: Record<HumanRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1
}

const serviceCredentialManagerRoles = new Set<HumanRole>(['owner', 'admin'])

export async function requireOrganizationMembership(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  minimumRole: HumanRole = 'viewer'
) {
  const user = await requireCurrentUser(ctx)
  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_org_user', (q) =>
      q.eq('organizationId', organizationId).eq('userId', user._id)
    )
    .unique()

  if (
    !membership ||
    membership.status !== 'active' ||
    roleRank[membership.role] < roleRank[minimumRole]
  ) {
    throw new ConvexError('Insufficient organization role')
  }

  return { user, membership }
}

export async function requireServiceActor(
  ctx: QueryCtx | MutationCtx,
  args: {
    credentialHash: string
    organizationId: Id<'organizations'>
    minimumRole?: ServiceActorRole
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
  if (roleRank[actor.role] < roleRank[minimumRole]) {
    throw new ConvexError('Insufficient service actor role')
  }

  return actor
}

export async function requireOrganizationAdmin(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>
) {
  const { user, membership } = await requireOrganizationMembership(ctx, organizationId)
  if (!serviceCredentialManagerRoles.has(membership.role)) {
    throw new ConvexError('Insufficient organization role')
  }

  return user
}

export async function requireServiceCredentialManager(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>
) {
  return await requireOrganizationAdmin(ctx, organizationId)
}

export async function writeServiceAudit(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>
    serviceActorId: Id<'serviceActors'>
    action: ServiceAuditAction
    resourceType: ServiceAuditResourceType
    resourceId?: string
  }
) {
  await ctx.db.insert('auditEvents', {
    ...args,
    createdAt: Date.now()
  })
}
