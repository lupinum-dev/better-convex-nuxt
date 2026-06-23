import { ConvexError, v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'

async function requireActiveBudgetRun(
  ctx: QueryCtx | MutationCtx,
  args: {
    agentRunId: Id<'agentRuns'>
  },
): Promise<Doc<'agentRuns'>> {
  const run = await ctx.db.get(args.agentRunId)
  if (!run || run.status !== 'active') {
    throw new ConvexError('Agent run is not active')
  }

  if (run.expiresAt !== undefined && run.expiresAt <= Date.now()) {
    throw new ConvexError('Agent run is expired')
  }

  return run
}

async function requireRunningUsageRun(
  ctx: QueryCtx | MutationCtx,
  args: {
    agentRunId: Id<'agentRuns'>
  },
): Promise<Doc<'agentRuns'>> {
  const run = await ctx.db.get(args.agentRunId)
  if (!run || run.status !== 'running') {
    throw new ConvexError('Agent run is not running')
  }

  if (run.expiresAt !== undefined && run.expiresAt <= Date.now()) {
    throw new ConvexError('Agent run is expired')
  }

  return run
}

function requireNonNegativeInteger(value: number | undefined, field: string) {
  if (value === undefined) {
    return
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new ConvexError(`Agent usage ${field} must be a non-negative integer`)
  }
}

function requireUsageTokens(args: {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  reasoningTokens?: number
  cachedInputTokens?: number
}) {
  requireNonNegativeInteger(args.promptTokens, 'promptTokens')
  requireNonNegativeInteger(args.completionTokens, 'completionTokens')
  requireNonNegativeInteger(args.totalTokens, 'totalTokens')
  requireNonNegativeInteger(args.reasoningTokens, 'reasoningTokens')
  requireNonNegativeInteger(args.cachedInputTokens, 'cachedInputTokens')

  if (args.totalTokens < args.promptTokens + args.completionTokens) {
    throw new ConvexError('Agent usage totalTokens must cover prompt and completion tokens')
  }

  if (
    args.cachedInputTokens !== undefined &&
    args.cachedInputTokens > args.promptTokens
  ) {
    throw new ConvexError('Agent usage cachedInputTokens cannot exceed promptTokens')
  }
}

function requireUsageLabel(value: string, field: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new ConvexError(`Agent usage ${field} is required`)
  }

  return normalized
}

async function sumRunTokens(ctx: QueryCtx | MutationCtx, agentRunId: Id<'agentRuns'>) {
  const events = await ctx.db
    .query('agentUsageEvents')
    .withIndex('by_agent_run', (q) => q.eq('agentRunId', agentRunId))
    .collect()
  return events.reduce((total, event) => total + event.totalTokens, 0)
}

async function sumOrganizationTokens(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const events = await ctx.db
    .query('agentUsageEvents')
    .withIndex('by_org_created', (q) => q.eq('organizationId', organizationId))
    .collect()
  return events.reduce((total, event) => total + event.totalTokens, 0)
}

async function sumDelegatingUserTokens(
  ctx: QueryCtx | MutationCtx,
  args: {
    organizationId: string
    startedByAuthUserId: string
  },
) {
  const events = await ctx.db
    .query('agentUsageEvents')
    .withIndex('by_org_created', (q) => q.eq('organizationId', args.organizationId))
    .collect()
  return events
    .filter((event) => event.startedByAuthUserId === args.startedByAuthUserId)
    .reduce((total, event) => total + event.totalTokens, 0)
}

async function enforceTokenBudget(
  ctx: QueryCtx | MutationCtx,
  args: {
    run: Doc<'agentRuns'>
    agentRunId: Id<'agentRuns'>
    nextTokens: number
    preflight: boolean
  },
) {
  if (args.run.maxTotalTokens !== undefined) {
    const spentTokens = await sumRunTokens(ctx, args.agentRunId)
    if (
      spentTokens + args.nextTokens > args.run.maxTotalTokens ||
      (args.preflight && spentTokens >= args.run.maxTotalTokens)
    ) {
      throw new ConvexError('Agent run token budget exceeded')
    }
  }

  if (args.run.maxOrganizationTotalTokens !== undefined) {
    const spentTokens = await sumOrganizationTokens(ctx, args.run.organizationId)
    if (
      spentTokens + args.nextTokens > args.run.maxOrganizationTotalTokens ||
      (args.preflight && spentTokens >= args.run.maxOrganizationTotalTokens)
    ) {
      throw new ConvexError('Organization agent token budget exceeded')
    }
  }

  if (args.run.maxUserTotalTokens !== undefined) {
    const spentTokens = await sumDelegatingUserTokens(ctx, {
      organizationId: args.run.organizationId,
      startedByAuthUserId: args.run.startedByAuthUserId,
    })
    if (
      spentTokens + args.nextTokens > args.run.maxUserTotalTokens ||
      (args.preflight && spentTokens >= args.run.maxUserTotalTokens)
    ) {
      throw new ConvexError('User agent token budget exceeded')
    }
  }
}

export const assertBudgetAvailable = internalQuery({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (ctx, args) => {
    const run = await requireActiveBudgetRun(ctx, args)
    await enforceTokenBudget(ctx, {
      run,
      agentRunId: args.agentRunId,
      nextTokens: 0,
      preflight: true,
    })

    return true
  },
})

export const recordUsage = internalMutation({
  args: {
    agentRunId: v.id('agentRuns'),
    threadId: v.string(),
    model: v.string(),
    provider: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    reasoningTokens: v.optional(v.number()),
    cachedInputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireUsageTokens(args)
    const model = requireUsageLabel(args.model, 'model')
    const provider = requireUsageLabel(args.provider, 'provider')
    const run = await requireRunningUsageRun(ctx, args)
    if (!run.threadId) {
      throw new ConvexError('Agent run has no thread')
    }
    const threadId = run.threadId

    if (threadId !== args.threadId) {
      throw new ConvexError('Agent usage thread mismatch')
    }

    await enforceTokenBudget(ctx, {
      run,
      agentRunId: args.agentRunId,
      nextTokens: args.totalTokens,
      preflight: false,
    })

    return await ctx.db.insert('agentUsageEvents', {
      organizationId: run.organizationId,
      agentRunId: args.agentRunId,
      threadId,
      model,
      provider,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      totalTokens: args.totalTokens,
      reasoningTokens: args.reasoningTokens,
      cachedInputTokens: args.cachedInputTokens,
      startedByAuthUserId: run.startedByAuthUserId,
      createdAt: Date.now(),
    })
  },
})

export const deleteForRun = internalMutation({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId)
    if (!run) {
      throw new ConvexError('Agent run has no thread')
    }
    if (run.status === 'active' || run.status === 'running') {
      throw new ConvexError('Active agent runs are not retention eligible')
    }
    if (!run.threadId) {
      throw new ConvexError('Agent run has no thread')
    }
    const threadId = run.threadId

    const events = await ctx.db
      .query('agentUsageEvents')
      .withIndex('by_agent_run', (q) => q.eq('agentRunId', args.agentRunId))
      .collect()
    const matchingEvents = events.filter(
      (event) => event.organizationId === run.organizationId && event.threadId === threadId,
    )
    await Promise.all(matchingEvents.map((event) => ctx.db.delete(event._id)))

    return matchingEvents.length
  },
})
