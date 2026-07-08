import { ConvexError, v } from 'convex/values'

import { components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery, mutation } from './_generated/server'
import { organizationPermissionOptions } from './auth'
import { requireBetterAuthProjectPermissions } from './betterAuthPermissions'
import { agentCapability } from './schema'

type AgentCapability = 'project:read' | 'project:draft' | 'project:delete'
type ProjectPermission = 'create' | 'read' | 'delete'

const agentCapabilityOrder: AgentCapability[] = ['project:read', 'project:draft', 'project:delete']

type DelegatedRunStartArgs = {
  organizationId: string
  agentName: string
  startedByAuthUserId: string
  capabilities: AgentCapability[]
  expiresAt?: number
  maxTotalTokens?: number
  maxOrganizationTotalTokens?: number
  maxUserTotalTokens?: number
}

type RequireRunStartPermission = (
  ctx: MutationCtx,
  args: {
    organizationId: string
    permissions: {
      project: ProjectPermission[]
    }
  },
) => Promise<{ authUserId: string }>

function projectPermissionsForCapabilities(capabilities: AgentCapability[]) {
  const permissions = new Set<ProjectPermission>()

  for (const capability of capabilities) {
    if (capability === 'project:read') {
      permissions.add('read')
    }

    if (capability === 'project:draft') {
      permissions.add('create')
    }

    if (capability === 'project:delete') {
      permissions.add('delete')
    }
  }

  return [...permissions]
}

function requireCapabilities(capabilities: AgentCapability[]) {
  if (capabilities.length === 0) {
    throw new ConvexError('At least one agent capability is required')
  }
}

function normalizeCapabilities(capabilities: AgentCapability[]) {
  const requestedCapabilities = new Set(capabilities)
  const uniqueCapabilities = agentCapabilityOrder.filter((capability) =>
    requestedCapabilities.has(capability),
  )
  requireCapabilities(uniqueCapabilities)
  return uniqueCapabilities
}

function normalizeAgentName(agentName: string) {
  const normalizedName = agentName.trim()
  if (!normalizedName) {
    throw new ConvexError('Agent run agentName is required')
  }

  return normalizedName
}

function normalizeDelegatedRunShape(args: { agentName: string; capabilities: AgentCapability[] }) {
  return {
    agentName: normalizeAgentName(args.agentName),
    capabilities: normalizeCapabilities(args.capabilities),
  }
}

function requirePositiveInteger(value: number | undefined, field: string) {
  if (value === undefined) {
    return
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new ConvexError(`Agent run ${field} must be a positive integer`)
  }
}

function requireDelegatedRunBounds(args: {
  expiresAt?: number
  maxTotalTokens?: number
  maxOrganizationTotalTokens?: number
  maxUserTotalTokens?: number
}) {
  if (args.expiresAt !== undefined && args.expiresAt <= Date.now()) {
    throw new ConvexError('Agent run expiry must be in the future')
  }

  requirePositiveInteger(args.maxTotalTokens, 'maxTotalTokens')
  requirePositiveInteger(args.maxOrganizationTotalTokens, 'maxOrganizationTotalTokens')
  requirePositiveInteger(args.maxUserTotalTokens, 'maxUserTotalTokens')
}

function roleHasProjectPermission(role: string, permission: ProjectPermission) {
  return role.split(',').some((rawRole) => {
    const configuredRole =
      organizationPermissionOptions.roles[
        rawRole.trim() as keyof typeof organizationPermissionOptions.roles
      ]

    return configuredRole?.authorize({ project: [permission] }).success === true
  })
}

async function insertDelegatedRun(ctx: MutationCtx, args: DelegatedRunStartArgs) {
  const now = Date.now()
  return await ctx.db.insert('agentRuns', {
    organizationId: args.organizationId,
    agentName: args.agentName,
    status: 'active',
    startedByAuthUserId: args.startedByAuthUserId,
    capabilities: args.capabilities,
    createdAt: now,
    updatedAt: now,
    expiresAt: args.expiresAt,
    maxTotalTokens: args.maxTotalTokens,
    maxOrganizationTotalTokens: args.maxOrganizationTotalTokens,
    maxUserTotalTokens: args.maxUserTotalTokens,
  })
}

export async function startDelegatedRunAfterPermissionCheck(
  ctx: MutationCtx,
  args: DelegatedRunStartArgs,
  requireRunStartPermission: RequireRunStartPermission,
) {
  const normalizedArgs = {
    ...args,
    ...normalizeDelegatedRunShape(args),
  }
  requireDelegatedRunBounds(normalizedArgs)

  const user = await requireRunStartPermission(ctx, {
    organizationId: normalizedArgs.organizationId,
    permissions: {
      project: projectPermissionsForCapabilities(normalizedArgs.capabilities),
    },
  })

  if (user.authUserId !== normalizedArgs.startedByAuthUserId) {
    throw new ConvexError('Permission check returned a different user')
  }

  return await insertDelegatedRun(ctx, normalizedArgs)
}

export async function requireAgentCapability(
  ctx: QueryCtx | MutationCtx,
  args: {
    agentRunId: Id<'agentRuns'>
    organizationId?: string
    capability: AgentCapability
  },
) {
  const run = await ctx.db.get(args.agentRunId)

  if (!run || run.status !== 'running') {
    throw new ConvexError('Agent run is not running')
  }

  if (run.expiresAt !== undefined && run.expiresAt <= Date.now()) {
    throw new ConvexError('Agent run is expired')
  }

  if (!run.threadId) {
    throw new ConvexError('Agent run has no thread')
  }

  if (args.organizationId !== undefined && run.organizationId !== args.organizationId) {
    throw new ConvexError('Agent run organization mismatch')
  }

  if (!run.capabilities.includes(args.capability)) {
    throw new ConvexError('Agent capability was not delegated')
  }

  return {
    run,
    actor: {
      kind: 'agent' as const,
      agentRunId: args.agentRunId,
      delegatedByAuthUserId: run.startedByAuthUserId,
    },
  }
}

export async function requireDelegatingUserCurrentProjectPermission(
  ctx: QueryCtx | MutationCtx,
  args: {
    agentRunId: Id<'agentRuns'>
    organizationId: string
    capability: AgentCapability
    permission: ProjectPermission
  },
) {
  const result = await requireAgentCapability(ctx, args)
  const member = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'member',
    where: [
      { field: 'organizationId', value: args.organizationId },
      { field: 'userId', value: result.run.startedByAuthUserId },
    ],
  })

  if (!member) {
    throw new ConvexError('Delegating user is not a current organization member')
  }

  if (!roleHasProjectPermission(member.role, args.permission)) {
    throw new ConvexError(`Delegating user no longer has project:${args.permission} permission`)
  }

  return result
}

export const claimRunExecutionByDelegatingUser = internalMutation({
  args: {
    agentRunId: v.id('agentRuns'),
    capability: agentCapability,
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId)
    if (!run || run.status !== 'active') {
      throw new ConvexError('Agent run is not active')
    }

    if (run.expiresAt !== undefined && run.expiresAt <= Date.now()) {
      throw new ConvexError('Agent run is expired')
    }

    if (!run.capabilities.includes(args.capability)) {
      throw new ConvexError('Agent capability was not delegated')
    }

    if (run.threadId) {
      throw new ConvexError('Agent run already has a thread')
    }

    const { user } = await requireBetterAuthProjectPermissions(ctx, {
      organizationId: run.organizationId,
      permissions: projectPermissionsForCapabilities([args.capability]),
      deniedMessage: 'Agent run execution denied',
    })

    if (user.id !== run.startedByAuthUserId) {
      throw new ConvexError('Only the delegating user can execute an agent run')
    }

    const now = Date.now()
    await ctx.db.patch(args.agentRunId, {
      status: 'running',
      updatedAt: now,
    })

    return {
      ...run,
      status: 'running' as const,
      updatedAt: now,
    }
  },
})

export const getThreadForRetention = internalQuery({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId)
    if (!run) {
      throw new ConvexError('Agent run not found')
    }

    if (run.status === 'active' || run.status === 'running') {
      throw new ConvexError('Active agent runs are not retention eligible')
    }

    if (!run.threadId) {
      throw new ConvexError('Agent run has no thread')
    }

    const { user } = await requireBetterAuthProjectPermissions(ctx, {
      organizationId: run.organizationId,
      permissions: ['read'],
      deniedMessage: 'Agent retention permission denied',
    })

    if (user.id !== run.startedByAuthUserId) {
      throw new ConvexError('Only the delegating user can retention-delete an agent run')
    }

    return {
      threadId: run.threadId,
    }
  },
})

export const startDelegatedRunWithBetterAuth = mutation({
  args: {
    organizationId: v.string(),
    agentName: v.string(),
    capabilities: v.array(agentCapability),
    expiresAt: v.optional(v.number()),
    maxTotalTokens: v.optional(v.number()),
    maxOrganizationTotalTokens: v.optional(v.number()),
    maxUserTotalTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalizedArgs = {
      ...args,
      ...normalizeDelegatedRunShape(args),
    }
    requireDelegatedRunBounds(normalizedArgs)

    const { user } = await requireBetterAuthProjectPermissions(ctx, {
      organizationId: normalizedArgs.organizationId,
      permissions: projectPermissionsForCapabilities(normalizedArgs.capabilities),
      deniedMessage: 'Agent run permission denied',
    })

    return await insertDelegatedRun(ctx, {
      organizationId: normalizedArgs.organizationId,
      agentName: normalizedArgs.agentName,
      startedByAuthUserId: user.id,
      capabilities: normalizedArgs.capabilities,
      expiresAt: normalizedArgs.expiresAt,
      maxTotalTokens: normalizedArgs.maxTotalTokens,
      maxOrganizationTotalTokens: normalizedArgs.maxOrganizationTotalTokens,
      maxUserTotalTokens: normalizedArgs.maxUserTotalTokens,
    })
  },
})

export const revokeRun = mutation({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId)
    if (!run) {
      throw new ConvexError('Agent run not found')
    }

    if (run.status !== 'active') {
      throw new ConvexError('Agent run is not revocable')
    }

    const { user } = await requireBetterAuthProjectPermissions(ctx, {
      organizationId: run.organizationId,
      permissions: ['read'],
      deniedMessage: 'Agent run revocation denied',
    })

    if (run.startedByAuthUserId !== user.id) {
      throw new ConvexError('Only the delegating user can revoke an agent run')
    }

    await ctx.db.patch(args.agentRunId, {
      status: 'revoked',
      updatedAt: Date.now(),
    })
  },
})

export const failRun = internalMutation({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId)
    if (!run || (run.status !== 'active' && run.status !== 'running')) {
      throw new ConvexError('Agent run is not active')
    }

    const now = Date.now()
    const pendingDrafts = await ctx.db
      .query('projectDrafts')
      .withIndex('by_agent_run', (q) => q.eq('sourceAgentRunId', args.agentRunId))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .collect()
    const pendingDeletionRequests = await ctx.db
      .query('projectDeletionRequests')
      .withIndex('by_agent_run', (q) => q.eq('sourceAgentRunId', args.agentRunId))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .collect()

    await Promise.all([
      ...pendingDrafts.map((draft) =>
        ctx.db.patch(draft._id, {
          status: 'rejected',
          decidedAt: now,
        }),
      ),
      ...pendingDeletionRequests.map((request) =>
        ctx.db.patch(request._id, {
          status: 'rejected',
          decidedAt: now,
        }),
      ),
    ])

    await ctx.db.patch(args.agentRunId, {
      status: 'failed',
      updatedAt: now,
    })
  },
})

export const completeRun = internalMutation({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId)
    if (!run || run.status !== 'running') {
      throw new ConvexError('Agent run is not running')
    }

    if (!run.threadId) {
      throw new ConvexError('Agent run has no thread')
    }

    await ctx.db.patch(args.agentRunId, {
      status: 'completed',
      updatedAt: Date.now(),
    })
  },
})

export const attachThread = internalMutation({
  args: {
    agentRunId: v.id('agentRuns'),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const threadId = args.threadId.trim()
    if (!threadId) {
      throw new ConvexError('Agent thread id is required')
    }

    const run = await ctx.db.get(args.agentRunId)
    if (!run || run.status !== 'running') {
      throw new ConvexError('Agent run is not running')
    }

    if (run.expiresAt !== undefined && run.expiresAt <= Date.now()) {
      throw new ConvexError('Agent run is expired')
    }

    if (run.threadId !== undefined) {
      throw new ConvexError('Agent run already has a thread')
    }

    await ctx.db.patch(args.agentRunId, {
      threadId,
      updatedAt: Date.now(),
    })
  },
})
