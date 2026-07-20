import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import {
  publicApi,
  internalApi,
  startRun,
  markRunRunning,
  startBetterAuthRun,
  createBetterAuthUser,
  createBetterAuthOrganization,
} from './agentic.test-helpers'
import { createAuth } from './auth'
import schema from './schema'
import { initConvexTest, modules } from './test.setup'

describe('agentic-saas tools, threads, usage, and retention', () => {
  it('attaches the Agent component thread id exactly once', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t)
    await markRunRunning(t, agentRunId)

    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId,
        threadId: '',
      }),
    ).rejects.toThrow('Agent thread id is required')

    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: '  thread_component_1  ',
    })

    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId,
        threadId: 'thread_component_2',
      }),
    ).rejects.toThrow('Agent run already has a thread')

    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))
    expect(run?.threadId).toBe('thread_component_1')
  })

  it('does not attach an Agent component thread after delegation expiry', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, { expiresAt: Date.now() + 60_000 })
    await markRunRunning(t, agentRunId)
    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, { expiresAt: Date.now() - 1 })
    })

    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId,
        threadId: 'thread_component_after_expiry',
      }),
    ).rejects.toThrow('Agent run is expired')

    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))
    expect(run?.threadId).toBeUndefined()
  })

  it('claims agent run execution exactly once before thread creation', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    const claimedRun = await t.mutation(internalApi.agentRuns.claimRunExecutionByDelegatingUser, {
      agentRunId,
      capability: 'project:draft',
      sessionTokenForTest: owner.token,
    })

    expect(claimedRun).toMatchObject({
      kind: 'claimed',
      run: {
        _id: agentRunId,
        status: 'running',
        organizationId,
        startedByAuthUserId: owner.userId,
      },
    })

    await expect(
      t.mutation(internalApi.agentRuns.claimRunExecutionByDelegatingUser, {
        agentRunId,
        capability: 'project:draft',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not active')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'running',
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)
  })

  it('does not mark successful runs completed before a thread exists', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t)
    await markRunRunning(t, agentRunId)

    await expect(
      t.mutation(internalApi.agentRuns.completeRun, {
        agentRunId,
      }),
    ).rejects.toThrow('Agent run has no thread')

    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: 'thread_component_1',
    })
    await t.mutation(internalApi.agentRuns.completeRun, {
      agentRunId,
    })

    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))
    expect(run).toMatchObject({
      status: 'completed',
      threadId: 'thread_component_1',
    })
  })

  it('records usage only for the canonical Agent component thread id', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t)
    await markRunRunning(t, agentRunId)

    const usageArgs = {
      agentRunId,
      threadId: 'thread_component_1',
      model: 'mock-model',
      provider: 'mock-provider',
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    }

    await expect(t.mutation(internalApi.agentUsage.recordUsage, usageArgs)).rejects.toThrow(
      'Agent run has no thread',
    )

    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: 'thread_component_1',
    })

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        organizationId: 'ignored-usage-org',
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        startedByAuthUserId: 'spoofed-usage-user',
      }),
    ).rejects.toThrow('Unexpected field `startedByAuthUserId`')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        agentName: 'duplicated-display-name',
      }),
    ).rejects.toThrow('Unexpected field `agentName`')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        threadId: 'thread_component_2',
      }),
    ).rejects.toThrow('Agent usage thread mismatch')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        totalTokens: -1,
      }),
    ).rejects.toThrow('Agent usage totalTokens must be a non-negative integer')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        totalTokens: 2,
      }),
    ).rejects.toThrow('Agent usage totalTokens must cover prompt and completion tokens')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        cachedInputTokens: 2,
      }),
    ).rejects.toThrow('Agent usage cachedInputTokens cannot exceed promptTokens')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        model: '   ',
      }),
    ).rejects.toThrow('Agent usage model is required')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        provider: '   ',
      }),
    ).rejects.toThrow('Agent usage provider is required')

    const usageId = await t.mutation(internalApi.agentUsage.recordUsage, {
      ...usageArgs,
      model: '  mock-model  ',
      provider: '  mock-provider  ',
    })
    const usage = await t.run(async (ctx) => await ctx.db.query('agentUsageEvents').take(10))

    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({
      _id: usageId,
      threadId: 'thread_component_1',
      agentRunId,
      organizationId: 'better-auth-org-id',
      startedByAuthUserId: 'better-auth-user-id',
      model: 'mock-model',
      provider: 'mock-provider',
      totalTokens: 3,
    })
  })

  it('does not record usage for expired running runs', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, { expiresAt: Date.now() + 60_000 })
    await markRunRunning(t, agentRunId)
    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: 'agent-thread-id',
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, { expiresAt: Date.now() - 1 })
    })

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        agentRunId,
        threadId: 'agent-thread-id',
        model: 'gpt-test',
        provider: 'openai',
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      }),
    ).rejects.toThrow('Agent run is expired')

    const usage = await t.run(async (ctx) => await ctx.db.query('agentUsageEvents').take(10))
    expect(usage).toHaveLength(0)
  })

  it('runs a real Convex Agent tool without trusting model-controlled authority fields', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        organizationId: 'ignored-public-org',
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    const result = await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(result).toMatchObject({
      text: 'Draft created for review.',
    })
    expect(result.threadId).toBeTypeOf('string')
    expect(result.messageCount).toBeGreaterThanOrEqual(3)
    expect(result.toolMessageCount).toBeGreaterThanOrEqual(2)
    expect(result.persistedMessagesContainRedaction).toBe(true)
    expect(result.persistedMessagesContainRawSecret).toBe(false)
    expect(rows.run).toMatchObject({
      status: 'completed',
      threadId: result.threadId,
    })
    expect(rows.drafts).toHaveLength(1)
    expect(rows.drafts[0]).toMatchObject({
      organizationId,
      title: 'Agent tool draft',
      body: 'Created through a real Convex Agent tool call',
      status: 'pending',
      sourceAgentRunId: agentRunId,
    })
    expect(rows.audit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'agent',
          agentRunId,
          delegatedByAuthUserId: owner.userId,
        },
        action: 'projectDrafts.create',
        capability: 'project:draft',
        resourceType: 'projectDraft',
        resourceId: rows.drafts[0]._id,
      }),
    )
    expect(rows.usage).toHaveLength(2)
    expect(rows.usage).toEqual([
      expect.objectContaining({
        organizationId,
        agentRunId,
        threadId: result.threadId,
        startedByAuthUserId: owner.userId,
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
      }),
      expect.objectContaining({
        organizationId,
        agentRunId,
        threadId: result.threadId,
        startedByAuthUserId: owner.userId,
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
      }),
    ])
    expect(rows.usage[0].model).toBeTypeOf('string')
    expect(rows.usage[0].provider).toBeTypeOf('string')
  })

  it('streams Agent text deltas only through an accessible delegated run', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const viewer = await createBetterAuthUser(t, 'agent-stream-viewer@example.com')

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.addMember({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          userId: viewer.userId,
          role: 'viewer',
        },
      })
    })

    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:read'],
    })

    await expect(
      t.action(publicApi.agentTools.streamProjectSummary, {
        agentRunId,
        sessionTokenForTest: viewer.token,
      }),
    ).rejects.toThrow('Only the delegating user can execute an agent run')

    const beforeOwnerStream = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))
    expect(beforeOwnerStream.run).toMatchObject({
      status: 'active',
      startedByAuthUserId: owner.userId,
    })
    expect(beforeOwnerStream.run?.threadId).toBeUndefined()
    expect(beforeOwnerStream.usage).toHaveLength(0)

    const result = await t.action(publicApi.agentTools.streamProjectSummary, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    expect(result).toMatchObject({
      text: 'Streamed draft summary for human review.',
    })
    expect(result.streamMessageCount).toBeGreaterThan(0)
    expect(result.deltaCount).toBeGreaterThan(0)

    const streams = await t.query(publicApi.agentThreads.syncAccessibleStreams, {
      agentRunId,
      sessionTokenForTest: owner.token,
      streamArgs: { kind: 'list' },
    })

    expect(streams).toMatchObject({
      agentRunId,
      organizationId,
      threadId: result.threadId,
      streams: {
        kind: 'list',
      },
    })
    expect(streams.streams.messages).toHaveLength(result.streamMessageCount)

    const streamMessages = streams.streams.messages as Array<{
      streamId: string
    }>
    const deltas = await t.query(publicApi.agentThreads.syncAccessibleStreams, {
      agentRunId,
      sessionTokenForTest: owner.token,
      streamArgs: {
        kind: 'deltas',
        cursors: streamMessages.map((message) => ({
          streamId: message.streamId,
          cursor: 0,
        })),
      },
    })

    expect(deltas.streams.kind).toBe('deltas')
    expect(deltas.streams.deltas.length).toBe(result.deltaCount)

    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, { expiresAt: Date.now() - 1 })
    })

    const streamsAfterExpiry = await t.query(publicApi.agentThreads.syncAccessibleStreams, {
      agentRunId,
      sessionTokenForTest: owner.token,
      streamArgs: { kind: 'list' },
    })
    expect(streamsAfterExpiry.streams.messages).toHaveLength(result.streamMessageCount)

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      records: await ctx.db.query('productRecords').take(10),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))
    expect(rows.run).toMatchObject({
      status: 'completed',
      threadId: result.threadId,
    })
    expect(rows.records).toHaveLength(0)
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(1)
    expect(rows.usage[0]).toMatchObject({
      organizationId,
      agentRunId,
      threadId: result.threadId,
      startedByAuthUserId: owner.userId,
    })

    await expect(
      t.query(publicApi.agentThreads.syncAccessibleStreams, {
        agentRunId,
        sessionTokenForTest: viewer.token,
        streamArgs: { kind: 'list' },
      }),
    ).rejects.toThrow('Agent thread belongs to a different delegating user')
  })

  it('lists Agent thread messages only through an accessible delegated run', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const viewer = await createBetterAuthUser(t, 'agent-thread-viewer@example.com')

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.addMember({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          userId: viewer.userId,
          role: 'viewer',
        },
      })
    })

    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run has no thread')

    const result = await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    const messages = await t.query(publicApi.agentThreads.listAccessibleMessages, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    expect(messages).toMatchObject({
      agentRunId,
      organizationId,
      threadId: result.threadId,
      messageCount: result.messageCount,
    })
    expect(messages.messages).toHaveLength(result.messageCount)

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId,
        title: 'Late draft',
        body: 'Should not be accepted after completion',
      }),
    ).rejects.toThrow('Agent run is not running')

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        agentRunId,
        sessionTokenForTest: viewer.token,
      }),
    ).rejects.toThrow('Agent thread belongs to a different delegating user')

    const otherOwner = await createBetterAuthUser(t, 'other-agent-owner@example.com')
    const otherOrganizationId = await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      const organization = await auth.api.createOrganization({
        headers: new Headers({ cookie: otherOwner.sessionCookie }),
        body: {
          name: 'Other Agent Org',
          slug: `other-agent-org-${Math.random().toString(36).slice(2)}`,
        },
      })
      return organization.id
    })

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        organizationId: otherOrganizationId,
        agentRunId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        agentRunId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Agent thread permission denied|User is not a member of the organization/)

    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, {
        status: 'revoked',
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not readable')
  })

  it('fails an agent run before recording usage beyond its token budget', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
      maxTotalTokens: 30,
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run token budget exceeded')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      records: await ctx.db.query('productRecords').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'failed',
      maxTotalTokens: 30,
    })
    expect(rows.drafts).toHaveLength(1)
    expect(rows.drafts[0]).toMatchObject({
      organizationId,
      sourceAgentRunId: agentRunId,
      status: 'rejected',
    })
    expect(rows.drafts[0].decidedAt).toBeTypeOf('number')
    expect(rows.records).toHaveLength(0)
    expect(rows.usage).toHaveLength(1)
    expect(rows.usage[0]).toMatchObject({
      organizationId,
      agentRunId,
      startedByAuthUserId: owner.userId,
      totalTokens: 20,
    })

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId: rows.drafts[0]._id,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be approved')

    const deletion = await t.action(publicApi.agentTools.deleteThreadForRetention, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })
    const afterRetention = await t.run(async (ctx) => ({
      draft: await ctx.db.get(rows.drafts[0]._id),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(deletion).toMatchObject({
      deletedUsageEvents: 1,
      hasMoreUsageEvents: false,
    })
    expect(afterRetention.draft).toMatchObject({
      status: 'rejected',
    })
    expect(afterRetention.usage).toHaveLength(0)
  })

  it('deletes Agent thread history and usage events without deleting product history', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const viewer = await createBetterAuthUser(t, 'agent-retention-viewer@example.com')
    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.addMember({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          userId: viewer.userId,
          role: 'viewer',
        },
      })
    })
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    const result = await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    const beforeRetention = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(beforeRetention.drafts).toHaveLength(1)
    expect(beforeRetention.audit).toHaveLength(1)
    expect(beforeRetention.usage).toHaveLength(2)

    await expect(
      t.action(publicApi.agentTools.deleteThreadForRetention, {
        agentRunId,
        sessionTokenForTest: viewer.token,
      }),
    ).rejects.toThrow('Only the delegating user can retention-delete an agent run')
    const afterViewerRetentionAttempt = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))
    expect(afterViewerRetentionAttempt.drafts).toHaveLength(1)
    expect(afterViewerRetentionAttempt.audit).toHaveLength(1)
    expect(afterViewerRetentionAttempt.usage).toHaveLength(2)

    await expect(
      t.mutation(internalApi.agentUsage.deleteForRun, {
        agentRunId,
        threadId: result.threadId,
      }),
    ).rejects.toThrow('Unexpected field `threadId`')

    const deletion = await t.action(publicApi.agentTools.deleteThreadForRetention, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    const afterRetention = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(deletion).toMatchObject({
      deletedUsageEvents: 2,
      hasMoreUsageEvents: false,
    })
    expect(afterRetention.drafts).toHaveLength(1)
    expect(afterRetention.audit).toHaveLength(1)
    expect(afterRetention.usage).toHaveLength(0)

    const retriedDeletion = await t.action(publicApi.agentTools.deleteThreadForRetention, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })
    const afterRetry = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(retriedDeletion).toMatchObject({
      deletedUsageEvents: 0,
      hasMoreUsageEvents: false,
    })
    expect(afterRetry.drafts).toHaveLength(1)
    expect(afterRetry.audit).toHaveLength(1)
    expect(afterRetry.usage).toHaveLength(0)
  })

  it('does not retention-delete active or running agent runs', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.action(publicApi.agentTools.deleteThreadForRetention, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Active agent runs are not retention eligible')

    await expect(
      t.mutation(internalApi.agentUsage.deleteForRun, {
        agentRunId,
      }),
    ).rejects.toThrow('Active agent runs are not retention eligible')

    await t.mutation(internalApi.agentRuns.claimRunExecutionByDelegatingUser, {
      agentRunId,
      capability: 'project:draft',
      sessionTokenForTest: owner.token,
    })
    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: 'agent-thread-id',
    })
    await t.mutation(internalApi.agentUsage.recordUsage, {
      agentRunId,
      threadId: 'agent-thread-id',
      model: 'mock-model',
      provider: 'mock-provider',
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    })

    await expect(
      t.mutation(internalApi.agentUsage.deleteForRun, {
        agentRunId,
      }),
    ).rejects.toThrow('Active agent runs are not retention eligible')

    const usage = await t.run(async (ctx) => await ctx.db.query('agentUsageEvents').take(10))
    expect(usage).toHaveLength(1)
  })
})
