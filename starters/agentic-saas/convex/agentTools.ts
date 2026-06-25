import { Agent, createTool, mockModel, stepCountIs } from '@convex-dev/agent'
import type { UsageHandler } from '@convex-dev/agent'
import { v } from 'convex/values'
import { z } from 'zod'

import { components, internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import type { ActionCtx } from './_generated/server'
import { action } from './_generated/server'

const draftToolInput = z.object({
  title: z.string(),
  body: z.string(),
})

const SERVER_ONLY_INTEGRATION_SECRET_CANARY = 'server-only-integration-secret-canary'

type DraftToolOutput = {
  draftId: Id<'projectDrafts'>
  redactedIntegrationSecret: string
}

type RunArgs = {
  agentRunId: Id<'agentRuns'>
}

type GenerateDraftWithToolResult = {
  threadId: string
  text: string
  messageCount: number
  toolMessageCount: number
  persistedMessagesContainRedaction: boolean
  persistedMessagesContainRawSecret: boolean
}

type StreamProjectSummaryResult = {
  threadId: string
  text: string
  streamMessageCount: number
  deltaCount: number
}

type AgentThread = {
  threadId: string
  generateText: (...args: unknown[]) => Promise<{ text: string }>
  streamText: (...args: unknown[]) => Promise<{ text: Promise<string> }>
}

function getCreatedAgentThread(createdThread: unknown): AgentThread {
  if (
    createdThread === null ||
    typeof createdThread !== 'object' ||
    !('thread' in createdThread)
  ) {
    throw new Error('Agent thread was not created')
  }

  const thread = (createdThread as { thread: unknown }).thread
  if (
    thread === null ||
    typeof thread !== 'object' ||
    typeof (thread as { threadId?: unknown }).threadId !== 'string' ||
    typeof (thread as { generateText?: unknown }).generateText !== 'function' ||
    typeof (thread as { streamText?: unknown }).streamText !== 'function'
  ) {
    throw new Error('Agent thread was not created')
  }

  return thread as AgentThread
}

function createDraftTool(args: RunArgs) {
  return createTool({
    description: 'Create a draft product record for human review.',
    args: draftToolInput,
    handler: async (ctx, input): Promise<DraftToolOutput> => {
      const draftId: Id<'projectDrafts'> = await ctx.runMutation(
        internal.projectDrafts.createFromAgent,
        {
          agentRunId: args.agentRunId,
          title: input.title,
          body: input.body,
        },
      )
      const integrationSecret = SERVER_ONLY_INTEGRATION_SECRET_CANARY

      return {
        draftId,
        redactedIntegrationSecret: integrationSecret.replace(integrationSecret, '[redacted]'),
      }
    },
  })
}

function createUsageHandler(args: RunArgs): UsageHandler {
  return async (usageCtx, usageArgs) => {
    await usageCtx.runMutation(internal.agentUsage.recordUsage, {
      agentRunId: args.agentRunId,
      threadId: usageArgs.threadId ?? '',
      model: usageArgs.model,
      provider: usageArgs.provider,
      promptTokens: usageArgs.usage.inputTokens ?? 0,
      completionTokens: usageArgs.usage.outputTokens ?? 0,
      totalTokens: usageArgs.usage.totalTokens ?? 0,
      reasoningTokens: usageArgs.usage.reasoningTokens,
      cachedInputTokens: usageArgs.usage.cachedInputTokens,
    })
  }
}

function isAgentBudgetError(error: unknown) {
  return String(error).includes('token budget exceeded')
}

async function assertAgentBudgetAvailable(
  ctx: ActionCtx,
  args: { agentRunId: Id<'agentRuns'> },
) {
  try {
    await ctx.runQuery(internal.agentUsage.assertBudgetAvailable, args)
  } catch (error) {
    if (isAgentBudgetError(error)) {
      await ctx.runMutation(internal.agentRuns.failRun, {
        agentRunId: args.agentRunId,
      })
    }
    throw error
  }
}

export const generateDraftWithTool = action({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (ctx, args): Promise<GenerateDraftWithToolResult> => {
    const runArgs: RunArgs = {
      agentRunId: args.agentRunId,
    }
    const agent = new Agent(components.agent, {
      name: 'project-assistant',
      instructions: 'Create reviewable draft product records.',
      languageModel: mockModel({
        doGenerate: (() => {
          let step = 0
          return async () => {
            step += 1

            if (step === 1) {
              return {
                content: [
                  {
                    type: 'tool-call',
                    toolCallId: 'create-draft-call',
                    toolName: 'createDraft',
                    input: JSON.stringify({
                      organizationId: 'ignored-model-controlled-org',
                      agentRunId: 'ignored-model-controlled-run',
                      title: 'Agent tool draft',
                      body: 'Created through a real Convex Agent tool call',
                    }),
                  },
                ],
                finishReason: 'tool-calls',
                usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
                warnings: [],
              }
            }

            return {
              content: [{ type: 'text', text: 'Draft created for review.' }],
              finishReason: 'stop',
              usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
              warnings: [],
            }
          }
        })(),
      }),
      tools: {
        createDraft: createDraftTool(runArgs),
      },
      usageHandler: createUsageHandler(runArgs),
      stopWhen: stepCountIs(2),
      storageOptions: { saveMessages: 'all' },
    })

    await assertAgentBudgetAvailable(ctx, { agentRunId: args.agentRunId })
    const run = (await ctx.runMutation(internal.agentRuns.claimRunExecutionByDelegatingUser, {
      agentRunId: args.agentRunId,
      capability: 'project:draft',
    })) as Doc<'agentRuns'>

    let thread: AgentThread | undefined
    let result
    try {
      const createdThread = await agent.createThread(ctx, {
        userId: run.startedByAuthUserId,
        title: 'Agent draft run',
      })
      thread = getCreatedAgentThread(createdThread)
      await ctx.runMutation(internal.agentRuns.attachThread, {
        agentRunId: args.agentRunId,
        threadId: thread.threadId,
      })

      result = await thread.generateText({
        prompt: 'Create a draft for review.',
      })
    } catch (error) {
      await ctx.runMutation(internal.agentRuns.failRun, {
        agentRunId: args.agentRunId,
      })
      throw error
    }
    if (!thread) {
      throw new Error('Agent thread was not created')
    }

    const messages = (await agent.listMessages(ctx, {
      threadId: thread.threadId,
      paginationOpts: { cursor: null, numItems: 10 },
      statuses: ['success'],
    })) as { page: Array<{ tool?: unknown }> }
    const serializedMessages = JSON.stringify(messages.page)
    await ctx.runMutation(internal.agentRuns.completeRun, {
      agentRunId: args.agentRunId,
    })

    return {
      threadId: thread.threadId,
      text: result.text,
      messageCount: messages.page.length,
      toolMessageCount: messages.page.filter((message) => message.tool).length,
      persistedMessagesContainRedaction: serializedMessages.includes('[redacted]'),
      persistedMessagesContainRawSecret: serializedMessages.includes(
        SERVER_ONLY_INTEGRATION_SECRET_CANARY,
      ),
    }
  },
})

export const streamProjectSummary = action({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (ctx, args): Promise<StreamProjectSummaryResult> => {
    const runArgs: RunArgs = {
      agentRunId: args.agentRunId,
    }
    const agent = new Agent(components.agent, {
      name: 'project-assistant',
      instructions: 'Stream reviewable project summaries.',
      languageModel: mockModel({
        content: [
          {
            type: 'text',
            text: 'Streamed draft summary for human review.',
          },
        ],
      }),
      usageHandler: createUsageHandler(runArgs),
      storageOptions: { saveMessages: 'all' },
    })

    await assertAgentBudgetAvailable(ctx, { agentRunId: args.agentRunId })
    const run = (await ctx.runMutation(internal.agentRuns.claimRunExecutionByDelegatingUser, {
      agentRunId: args.agentRunId,
      capability: 'project:read',
    })) as Doc<'agentRuns'>

    let thread: AgentThread | undefined
    try {
      const createdThread = await agent.createThread(ctx, {
        userId: run.startedByAuthUserId,
        title: 'Agent streaming run',
      })
      thread = getCreatedAgentThread(createdThread)
      await ctx.runMutation(internal.agentRuns.attachThread, {
        agentRunId: args.agentRunId,
        threadId: thread.threadId,
      })

      const result = await thread.streamText(
        {
          prompt: 'Stream a project summary for review.',
        },
        {
          saveStreamDeltas: {
            chunking: 'word',
            throttleMs: 0,
          },
        },
      )
      const text = await result.text

      const streamList = (await agent.syncStreams(ctx, {
        threadId: thread.threadId,
        streamArgs: { kind: 'list' },
        includeStatuses: ['finished'],
      })) as { kind: string } | undefined
      const streamMessages: Array<{ streamId: string }> =
        streamList?.kind === 'list'
          ? (streamList as { kind: 'list'; messages: Array<{ streamId: string }> }).messages
          : []
      const deltas =
        streamMessages.length === 0
          ? undefined
          : ((await agent.syncStreams(ctx, {
              threadId: thread.threadId,
              streamArgs: {
                kind: 'deltas',
                cursors: streamMessages.map((message) => ({
                  streamId: message.streamId,
                  cursor: 0,
                })),
              },
              includeStatuses: ['finished'],
            })) as { kind: 'deltas'; deltas: unknown[] } | { kind: string })

      await ctx.runMutation(internal.agentRuns.completeRun, {
        agentRunId: args.agentRunId,
      })

      return {
        threadId: thread.threadId,
        text,
        streamMessageCount: streamMessages.length,
        deltaCount:
          deltas?.kind === 'deltas'
            ? (deltas as { kind: 'deltas'; deltas: unknown[] }).deltas.length
            : 0,
      }
    } catch (error) {
      await ctx.runMutation(internal.agentRuns.failRun, {
        agentRunId: args.agentRunId,
      })
      throw error
    }
  },
})

export const deleteThreadForRetention = action({
  args: {
    agentRunId: v.id('agentRuns'),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    beforeMessageCount: number
    afterMessageCount: number
    deletedUsageEvents: number
  }> => {
    const agent = new Agent(components.agent, {
      name: 'project-assistant',
      instructions: 'Create reviewable draft product records.',
      languageModel: mockModel({
        doGenerate: async () => ({
          content: [{ type: 'text', text: '' }],
          finishReason: 'stop',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          warnings: [],
        }),
      }),
    })

    const { threadId } = await ctx.runQuery(internal.agentRuns.getThreadForRetention, {
      agentRunId: args.agentRunId,
    })

    const beforeMessages = await agent.listMessages(ctx, {
      threadId,
      paginationOpts: { cursor: null, numItems: 50 },
      statuses: ['success'],
    })

    await agent.deleteThreadSync(ctx, {
      threadId,
    })

    const deletedUsageEvents: number = await ctx.runMutation(internal.agentUsage.deleteForRun, {
      agentRunId: args.agentRunId,
    })

    const afterMessages = await agent.listMessages(ctx, {
      threadId,
      paginationOpts: { cursor: null, numItems: 50 },
      statuses: ['success'],
    })

    return {
      beforeMessageCount: beforeMessages.page.length,
      afterMessageCount: afterMessages.page.length,
      deletedUsageEvents,
    }
  },
})
