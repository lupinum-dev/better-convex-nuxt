import { ConvexError } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { requireCurrentUser } from './users'

type HumanRole = 'owner' | 'admin' | 'member' | 'viewer'
type ServiceActorRole = 'admin' | 'member' | 'viewer'
type AuditActor =
  | { kind: 'user'; userId: Id<'users'> }
  | { kind: 'serviceActor'; serviceActorId: Id<'serviceActors'> }
type AuditAction =
  | 'organizations.create'
  | 'projects.create'
  | 'projects.delete'
  | 'serviceActors.create'
  | 'agentCredentials.revoke'
  | 'approvals.request'
  | 'approvals.approve'
  | 'approvals.reject'
type AuditResourceType =
  | 'organization'
  | 'project'
  | 'serviceActor'
  | 'agentCredential'
  | 'approval'
type AuditSource = 'human' | 'mcp' | 'agent'

const roleRank: Record<HumanRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
}

const serviceCredentialManagerRoles = new Set<HumanRole>(['owner', 'admin'])

function hashBearerSecret(secret: string) {
  return crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(secret))
    .then((digest) =>
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    )
}

export function requireMcpServerCall(serverSecret: string) {
  const expected = process.env.MCP_SERVER_SECRET
  if (!expected || expected.trim() !== expected || expected.length < 32) {
    throw new ConvexError('MCP server is not configured securely')
  }
  if (!serverSecret || serverSecret !== expected) {
    throw new ConvexError('MCP server authorization required')
  }
}

export async function requireOrganizationMembership(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  minimumRole: HumanRole = 'viewer',
) {
  const user = await requireCurrentUser(ctx)
  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', user._id))
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
    bearerToken: string
    minimumRole?: ServiceActorRole
  },
) {
  if (!args.bearerToken || args.bearerToken.length > 256) {
    throw new ConvexError('Service actor credential denied')
  }
  const credentialHash = await hashBearerSecret(args.bearerToken)
  const credential = await ctx.db
    .query('agentCredentials')
    .withIndex('by_secret_hash', (q) => q.eq('secretHash', credentialHash))
    .unique()

  if (!credential || credential.status !== 'active') {
    throw new ConvexError('Service actor credential denied')
  }

  const actor = await ctx.db.get(credential.serviceActorId)
  if (!actor || actor.status !== 'active' || actor.organizationId !== credential.organizationId) {
    throw new ConvexError('Service actor denied')
  }

  const minimumRole = args.minimumRole ?? 'viewer'
  if (roleRank[actor.role] < roleRank[minimumRole]) {
    throw new ConvexError('Insufficient service actor role')
  }

  return {
    actor,
    credential,
    organizationId: credential.organizationId,
  }
}

export async function requireOrganizationAdmin(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
) {
  const { user, membership } = await requireOrganizationMembership(ctx, organizationId)
  if (!serviceCredentialManagerRoles.has(membership.role)) {
    throw new ConvexError('Insufficient organization role')
  }

  return user
}

export async function requireServiceCredentialManager(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
) {
  return await requireOrganizationAdmin(ctx, organizationId)
}

export async function writeAuditEvent(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>
    actor: AuditActor
    action: AuditAction
    resourceType: AuditResourceType
    source: AuditSource
    resourceId?: string
  },
) {
  await ctx.db.insert('auditEvents', {
    ...args,
    createdAt: Date.now(),
  })
}
