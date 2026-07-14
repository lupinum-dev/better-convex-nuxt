/* eslint-disable @typescript-eslint/no-explicit-any -- the test harness injects sessionTokenForTest outside public Convex args. */
import { readFileSync } from 'node:fs'

import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startDelegatedRunAfterPermissionCheck } from './agentRuns'
import { createAuth } from './auth'
import {
  maxAgentNameLength,
  maxAgentThreadIdLength,
  maxDeletionReasonLength,
  maxDraftBodyLength,
  maxDraftTitleLength,
  maxPendingReviewsPerQueue,
  maxUsageEventsPerRun,
  maxUsageLabelLength,
  retentionPageSize,
} from './resourceBounds'
import schema from './schema'
import { initConvexTest, modules } from './test.setup'

const publicApi = api as any
const internalApi = internal as any

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

async function createOwnerOrganization(t: ReturnType<typeof initConvexTest>) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    const password = 'Password123456!'
    const signedUp = await auth.api.signUpEmail({
      body: {
        email: `resource-owner-${Math.random().toString(36).slice(2)}@example.com`,
        password,
        name: 'Resource Owner',
      },
    })
    const signedIn = await auth.api.signInEmail({
      body: {
        email: signedUp.user.email,
        password,
      },
    })
    if (!signedIn.token) {
      throw new Error('Better Auth sign-in did not return a session token')
    }
    const organization = await auth.api.createOrganization({
      headers: new Headers({ authorization: `Bearer ${signedIn.token}` }),
      body: {
        name: 'Resource Bound Org',
        slug: `resource-bound-${Math.random().toString(36).slice(2)}`,
      },
    })

    return {
      organizationId: organization.id,
      token: signedIn.token,
      userId: signedUp.user.id,
    }
  })
}

async function startRunningRun(
  t: ReturnType<typeof initConvexTest>,
  args: {
    organizationId: string
    token: string
    capability: 'project:draft' | 'project:delete'
  },
) {
  const agentRunId = (await t.mutation(publicApi.agentRuns.startDelegatedRunWithBetterAuth, {
    organizationId: args.organizationId,
    agentName: 'project-assistant',
    sessionTokenForTest: args.token,
    capabilities: [args.capability],
  })) as Id<'agentRuns'>
  await t.run(async (ctx) => {
    await ctx.db.patch(agentRunId, {
      status: 'running',
      threadId: `thread-${agentRunId}`,
      updatedAt: Date.now(),
    })
  })
  return agentRunId
}

describe('agentic resource bounds', () => {
  it('hard-cuts aggregate budgets and unbounded production scans', () => {
    const agentRuns = readSource('./agentRuns.ts')
    const agentUsage = readSource('./agentUsage.ts')
    const drafts = readSource('./projectDrafts.ts')
    const deletionRequests = readSource('./projectDeletionRequests.ts')
    const schemaSource = readSource('./schema.ts')
    const tools = readSource('./agentTools.ts')
    const usageSchema = schemaSource.slice(schemaSource.indexOf('agentUsageEvents: defineTable({'))

    for (const source of [agentRuns, agentUsage, schemaSource]) {
      expect(source).not.toContain('maxOrganizationTotalTokens')
      expect(source).not.toContain('maxUserTotalTokens')
    }
    for (const source of [agentRuns, agentUsage, drafts, deletionRequests]) {
      expect(source).not.toContain('.collect()')
    }
    expect(usageSchema).not.toContain(".index('by_org_created', ['organizationId', 'createdAt'])")
    expect(usageSchema).not.toContain(".index('by_thread', ['threadId'])")
    expect(tools).toContain('agent.deleteThreadAsync(ctx, {')
    expect(tools).toContain('pageSize: retentionPageSize')
  })

  it('rejects oversized persisted run, review, and usage strings', async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.run(
        async (ctx) =>
          await startDelegatedRunAfterPermissionCheck(
            ctx,
            {
              organizationId: 'org_string_bounds',
              agentName: 'a'.repeat(maxAgentNameLength + 1),
              startedByAuthUserId: 'user_string_bounds',
              capabilities: ['project:draft'],
            },
            async () => ({ authUserId: 'user_string_bounds' }),
          ),
      ),
    ).rejects.toThrow(`Agent run agentName must be ${maxAgentNameLength} characters or less`)

    const { agentRunId, productRecordId } = await t.run(async (ctx) => {
      const agentRunId = await ctx.db.insert('agentRuns', {
        organizationId: 'org_string_bounds',
        threadId: 'thread_string_bounds',
        agentName: 'project-assistant',
        status: 'running',
        startedByAuthUserId: 'user_string_bounds',
        capabilities: ['project:draft', 'project:delete'],
        createdAt: 0,
        updatedAt: 0,
      })
      const sourceDraftId = await ctx.db.insert('projectDrafts', {
        organizationId: 'org_string_bounds',
        title: 'Approved source',
        body: 'Canonical source',
        status: 'approved',
        sourceAgentRunId: agentRunId,
        createdAt: 0,
        decidedAt: 0,
      })
      const productRecordId = await ctx.db.insert('productRecords', {
        organizationId: 'org_string_bounds',
        title: 'Record',
        body: 'Canonical record',
        sourceDraftId,
        approvedByAuthUserId: 'user_string_bounds',
        createdAt: 0,
      })
      return { agentRunId, productRecordId }
    })

    await expect(
      t.mutation(internal.agentRuns.attachThread, {
        agentRunId,
        threadId: 't'.repeat(maxAgentThreadIdLength + 1),
      }),
    ).rejects.toThrow(`Agent thread id must be ${maxAgentThreadIdLength} characters or less`)
    await expect(
      t.mutation(internal.projectDrafts.createFromAgent, {
        agentRunId,
        title: 't'.repeat(maxDraftTitleLength + 1),
        body: 'Body',
      }),
    ).rejects.toThrow(`Draft title must be ${maxDraftTitleLength} characters or less`)
    await expect(
      t.mutation(internal.projectDrafts.createFromAgent, {
        agentRunId,
        title: 'Title',
        body: 'b'.repeat(maxDraftBodyLength + 1),
      }),
    ).rejects.toThrow(`Draft body must be ${maxDraftBodyLength} characters or less`)
    await expect(
      t.mutation(internal.projectDeletionRequests.createFromAgent, {
        agentRunId,
        productRecordId,
        reason: 'r'.repeat(maxDeletionReasonLength + 1),
      }),
    ).rejects.toThrow(`Deletion reason must be ${maxDeletionReasonLength} characters or less`)

    const usageArgs = {
      agentRunId,
      threadId: 'thread_string_bounds',
      model: 'mock-model',
      provider: 'mock-provider',
      promptTokens: 1,
      completionTokens: 0,
      totalTokens: 1,
    }
    await expect(
      t.mutation(internal.agentUsage.recordUsage, {
        ...usageArgs,
        model: 'm'.repeat(maxUsageLabelLength + 1),
      }),
    ).rejects.toThrow(`Agent usage model must be ${maxUsageLabelLength} characters or less`)
    await expect(
      t.mutation(internal.agentUsage.recordUsage, {
        ...usageArgs,
        provider: 'p'.repeat(maxUsageLabelLength + 1),
      }),
    ).rejects.toThrow(`Agent usage provider must be ${maxUsageLabelLength} characters or less`)
    await expect(
      t.mutation(internal.agentUsage.recordUsage, {
        ...usageArgs,
        threadId: 't'.repeat(maxAgentThreadIdLength + 1),
      }),
    ).rejects.toThrow(`Agent usage threadId must be ${maxAgentThreadIdLength} characters or less`)
  })

  it('keeps both organization review queues complete within their fixed cap', async () => {
    const t = initConvexTest()
    const owner = await createOwnerOrganization(t)
    const draftRunId = await startRunningRun(t, {
      organizationId: owner.organizationId,
      token: owner.token,
      capability: 'project:draft',
    })
    const deletionRunId = await startRunningRun(t, {
      organizationId: owner.organizationId,
      token: owner.token,
      capability: 'project:delete',
    })

    const productRecordId = await t.run(async (ctx) => {
      const sourceDraftId = await ctx.db.insert('projectDrafts', {
        organizationId: owner.organizationId,
        title: 'Approved source',
        body: 'Source for bounded deletion requests',
        status: 'approved',
        sourceAgentRunId: draftRunId,
        createdAt: 0,
        decidedAt: 0,
      })
      const recordId = await ctx.db.insert('productRecords', {
        organizationId: owner.organizationId,
        title: 'Bounded record',
        body: 'Canonical product state',
        sourceDraftId,
        approvedByAuthUserId: owner.userId,
        createdAt: 0,
      })

      for (let index = 0; index < maxPendingReviewsPerQueue; index += 1) {
        await ctx.db.insert('projectDrafts', {
          organizationId: owner.organizationId,
          title: `Pending draft ${index}`,
          body: 'Bounded pending draft',
          status: 'pending',
          sourceAgentRunId: draftRunId,
          createdAt: index + 1,
        })
        await ctx.db.insert('projectDeletionRequests', {
          organizationId: owner.organizationId,
          productRecordId: recordId,
          reason: `Pending deletion ${index}`,
          status: 'pending',
          sourceAgentRunId: deletionRunId,
          createdAt: index + 1,
        })
      }

      return recordId
    })

    const drafts = await t.query(publicApi.projectDrafts.listPending, {
      organizationId: owner.organizationId,
      sessionTokenForTest: owner.token,
    })
    const deletionRequests = await t.query(publicApi.projectDeletionRequests.listPending, {
      organizationId: owner.organizationId,
      sessionTokenForTest: owner.token,
    })
    expect(drafts).toHaveLength(maxPendingReviewsPerQueue)
    expect(deletionRequests).toHaveLength(maxPendingReviewsPerQueue)

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: draftRunId,
        title: 'Over limit',
        body: 'Must not be inserted',
      }),
    ).rejects.toThrow('Draft review queue is full')
    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deletionRunId,
        productRecordId,
        reason: 'Must not be inserted',
      }),
    ).rejects.toThrow('Deletion review queue is full')
  })

  it('rejects every pending review at the maximum legal failure-cleanup bound', async () => {
    const t = convexTest(schema, modules)
    const rows = await t.run(async (ctx) => {
      const agentRunId = await ctx.db.insert('agentRuns', {
        organizationId: 'org_failure_bound',
        threadId: 'thread_failure_bound',
        agentName: 'project-assistant',
        status: 'running',
        startedByAuthUserId: 'user_failure_bound',
        capabilities: ['project:draft', 'project:delete'],
        createdAt: 0,
        updatedAt: 0,
      })
      const sourceDraftId = await ctx.db.insert('projectDrafts', {
        organizationId: 'org_failure_bound',
        title: 'Approved source',
        body: 'Canonical source',
        status: 'approved',
        sourceAgentRunId: agentRunId,
        createdAt: 0,
        decidedAt: 0,
      })
      const productRecordId = await ctx.db.insert('productRecords', {
        organizationId: 'org_failure_bound',
        title: 'Record',
        body: 'Canonical record',
        sourceDraftId,
        approvedByAuthUserId: 'user_failure_bound',
        createdAt: 0,
      })

      for (let index = 0; index < maxPendingReviewsPerQueue; index += 1) {
        await ctx.db.insert('projectDrafts', {
          organizationId: 'org_failure_bound',
          title: `Draft ${index}`,
          body: 'Pending',
          status: 'pending',
          sourceAgentRunId: agentRunId,
          createdAt: index + 1,
        })
        await ctx.db.insert('projectDeletionRequests', {
          organizationId: 'org_failure_bound',
          productRecordId,
          reason: `Delete ${index}`,
          status: 'pending',
          sourceAgentRunId: agentRunId,
          createdAt: index + 1,
        })
      }

      return { agentRunId }
    })

    await t.mutation(internal.agentRuns.failRun, { agentRunId: rows.agentRunId })

    const result = await t.run(async (ctx) => ({
      run: await ctx.db.get(rows.agentRunId),
      drafts: await ctx.db
        .query('projectDrafts')
        .withIndex('by_agent_run_status', (q) =>
          q.eq('sourceAgentRunId', rows.agentRunId).eq('status', 'pending'),
        )
        .collect(),
      deletionRequests: await ctx.db
        .query('projectDeletionRequests')
        .withIndex('by_agent_run_status', (q) =>
          q.eq('sourceAgentRunId', rows.agentRunId).eq('status', 'pending'),
        )
        .collect(),
    }))
    expect(result.run?.status).toBe('failed')
    expect(result.drafts).toHaveLength(0)
    expect(result.deletionRequests).toHaveLength(0)
  })

  it('caps per-run usage and drains legacy retention rows in retryable batches', async () => {
    const t = convexTest(schema, modules)
    const { runningRunId, terminalRunId } = await t.run(async (ctx) => {
      const runningRunId = await ctx.db.insert('agentRuns', {
        organizationId: 'org_usage_bound',
        threadId: 'thread_usage_bound',
        agentName: 'project-assistant',
        status: 'running',
        startedByAuthUserId: 'user_usage_bound',
        capabilities: ['project:read'],
        createdAt: 0,
        updatedAt: 0,
      })
      const terminalRunId = await ctx.db.insert('agentRuns', {
        organizationId: 'org_retention_bound',
        threadId: 'thread_retention_bound',
        agentName: 'project-assistant',
        status: 'completed',
        startedByAuthUserId: 'user_retention_bound',
        capabilities: ['project:read'],
        createdAt: 0,
        updatedAt: 0,
      })

      for (let index = 0; index < maxUsageEventsPerRun - 1; index += 1) {
        await ctx.db.insert('agentUsageEvents', {
          organizationId: 'org_usage_bound',
          agentRunId: runningRunId,
          threadId: 'thread_usage_bound',
          startedByAuthUserId: 'user_usage_bound',
          model: 'mock-model',
          provider: 'mock-provider',
          promptTokens: 1,
          completionTokens: 0,
          totalTokens: 1,
          createdAt: index,
        })
      }
      for (let index = 0; index < retentionPageSize + 1; index += 1) {
        await ctx.db.insert('agentUsageEvents', {
          organizationId: 'org_retention_bound',
          agentRunId: terminalRunId,
          threadId: 'thread_retention_bound',
          startedByAuthUserId: 'user_retention_bound',
          model: 'legacy-model',
          provider: 'legacy-provider',
          promptTokens: 1,
          completionTokens: 0,
          totalTokens: 1,
          createdAt: index,
        })
      }

      return { runningRunId, terminalRunId }
    })

    const usageArgs = {
      agentRunId: runningRunId,
      threadId: 'thread_usage_bound',
      model: 'mock-model',
      provider: 'mock-provider',
      promptTokens: 1,
      completionTokens: 0,
      totalTokens: 1,
    }
    await expect(t.mutation(internal.agentUsage.recordUsage, usageArgs)).resolves.toBeTypeOf(
      'string',
    )
    await expect(t.mutation(internal.agentUsage.recordUsage, usageArgs)).rejects.toThrow(
      'Agent run usage event limit reached',
    )

    await expect(
      t.mutation(internal.agentUsage.deleteForRun, { agentRunId: terminalRunId }),
    ).resolves.toEqual({ deletedCount: retentionPageSize, hasMore: true })
    await expect(
      t.mutation(internal.agentUsage.deleteForRun, { agentRunId: terminalRunId }),
    ).resolves.toEqual({ deletedCount: 1, hasMore: false })
  })
})
