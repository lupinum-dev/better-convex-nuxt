import { ConvexError, v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation } from './_generated/server'
import {
  maxAgentThreadIdLength,
  maxUsageEventsPerRun,
  maxUsageLabelLength,
  retentionPageSize,
} from './resourceBounds'

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

  if (args.cachedInputTokens !== undefined && args.cachedInputTokens > args.promptTokens) {
    throw new ConvexError('Agent usage cachedInputTokens cannot exceed promptTokens')
  }
}

function requireUsageLabel(value: string, field: string) {
  if (value.length > maxUsageLabelLength) {
    throw new ConvexError(`Agent usage ${field} must be ${maxUsageLabelLength} characters or less`)
  }
  const normalized = value.trim()
  if (!normalized) {
    throw new ConvexError(`Agent usage ${field} is required`)
  }

  return normalized
}

function requireUsageThreadId(value: string) {
  if (!value) {
    throw new ConvexError('Agent usage threadId is required')
  }
  if (value.length > maxAgentThreadIdLength) {
    throw new ConvexError(
      `Agent usage threadId must be ${maxAgentThreadIdLength} characters or less`,
    )
  }
}

async function listRunUsageEvents(ctx: QueryCtx | MutationCtx, agentRunId: Id<'agentRuns'>) {
  return await ctx.db
    .query('agentUsageEvents')
    .withIndex('by_agent_run', (q) => q.eq('agentRunId', agentRunId))
    .take(maxUsageEventsPerRun)
}

function getTokenBudgetErrorForEvents(
  run: Doc<'agentRuns'>,
  events: Doc<'agentUsageEvents'>[],
  nextTokens: number,
  preflight: boolean,
) {
  if (run.maxTotalTokens === undefined) {
    return null
  }

  const spentTokens = events.reduce((total, event) => total + event.totalTokens, 0)
  if (
    spentTokens + nextTokens > run.maxTotalTokens ||
    (preflight && spentTokens >= run.maxTotalTokens)
  ) {
    return 'Agent run token budget exceeded'
  }

  return null
}

export async function getTokenBudgetError(
  ctx: QueryCtx | MutationCtx,
  args: {
    run: Doc<'agentRuns'>
    agentRunId: Id<'agentRuns'>
    nextTokens: number
    preflight: boolean
  },
) {
  if (args.run.maxTotalTokens === undefined) {
    return null
  }

  const events = await listRunUsageEvents(ctx, args.agentRunId)
  return getTokenBudgetErrorForEvents(args.run, events, args.nextTokens, args.preflight)
}

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
    requireUsageThreadId(args.threadId)
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

    const usageEvents = await listRunUsageEvents(ctx, args.agentRunId)
    if (usageEvents.length >= maxUsageEventsPerRun) {
      throw new ConvexError('Agent run usage event limit reached')
    }
    const budgetError = getTokenBudgetErrorForEvents(run, usageEvents, args.totalTokens, false)
    if (budgetError) {
      throw new ConvexError(budgetError)
    }

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
    const events = await ctx.db
      .query('agentUsageEvents')
      .withIndex('by_agent_run', (q) => q.eq('agentRunId', args.agentRunId))
      .take(retentionPageSize + 1)
    const batch = events.slice(0, retentionPageSize)
    for (const event of batch) {
      await ctx.db.delete(event._id)
    }

    return {
      deletedCount: batch.length,
      hasMore: events.length > batch.length,
    }
  },
})
