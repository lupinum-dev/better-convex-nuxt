import { listMessages, syncStreams, vStreamArgs } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'

import { components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { query } from './_generated/server'
import { requireBetterAuthProjectPermissions } from './betterAuthPermissions'

async function requireReadableAgentThread(
  ctx: QueryCtx,
  args: {
    agentRunId: Id<'agentRuns'>
    deniedMessage: string
  },
) {
  const run = await ctx.db.get(args.agentRunId)

  if (!run) {
    throw new ConvexError('Agent run not found')
  }

  if (run.status !== 'active' && run.status !== 'running' && run.status !== 'completed') {
    throw new ConvexError('Agent run is not readable')
  }

  if (
    (run.status === 'active' || run.status === 'running') &&
    run.expiresAt !== undefined &&
    run.expiresAt <= Date.now()
  ) {
    throw new ConvexError('Agent run is expired')
  }

  const { user } = await requireBetterAuthProjectPermissions(ctx, {
    organizationId: run.organizationId,
    permissions: ['read'],
    deniedMessage: args.deniedMessage,
  })

  if (run.startedByAuthUserId !== user.id) {
    throw new ConvexError('Agent thread belongs to a different delegating user')
  }

  if (!run.threadId) {
    throw new ConvexError('Agent run has no thread')
  }

  return {
    run,
    threadId: run.threadId,
  }
}

export const listAccessibleMessages = query({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (ctx, args) => {
    const { run, threadId } = await requireReadableAgentThread(ctx, {
      ...args,
      deniedMessage: 'Agent thread permission denied',
    })

    const messages = await listMessages(ctx, components.agent, {
      threadId,
      paginationOpts: { cursor: null, numItems: 10 },
      statuses: ['success'],
    })

    return {
      agentRunId: run._id,
      organizationId: run.organizationId,
      threadId,
      messageCount: messages.page.length,
      isDone: messages.isDone,
      continueCursor: messages.continueCursor,
      messages: messages.page,
    }
  },
})

export const syncAccessibleStreams = query({
  args: {
    agentRunId: v.id('agentRuns'),
    streamArgs: v.optional(vStreamArgs),
  },
  handler: async (ctx, args) => {
    const { run, threadId } = await requireReadableAgentThread(ctx, {
      ...args,
      deniedMessage: 'Agent stream permission denied',
    })

    return {
      agentRunId: run._id,
      organizationId: run.organizationId,
      threadId,
      streams: await syncStreams(ctx, components.agent, {
        threadId,
        streamArgs: args.streamArgs,
        includeStatuses: ['streaming', 'finished'],
      }),
    }
  },
})
