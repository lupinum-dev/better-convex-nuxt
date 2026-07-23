import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import type { Doc, Id } from './_generated/dataModel'
import {
  publicApi,
  internalApi,
  startRun,
  markRunRunning,
  markRunRunningWithThread,
  createApprovedRecord,
  startBetterAuthRun,
  createBetterAuthUser,
  createBetterAuthOrganization,
  createBetterAuthOrganizationWithAdmin,
} from './agentic.test-helpers'
import { createAuth } from './auth'
import schema from './schema'
import { initConvexTest, modules } from './test.setup'

describe('agentic-saas human review workflows', () => {
  it('re-checks draft permission before claiming agent run execution', async () => {
    const t = initConvexTest()
    const { owner, admin, adminMember, organizationId } =
      await createBetterAuthOrganizationWithAdmin(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: admin.token,
      capabilities: ['project:draft'],
    })

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.updateMemberRole({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          memberId: adminMember.id,
          role: 'viewer',
        },
      })
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: admin.token,
      }),
    ).rejects.toThrow('Agent run execution denied')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'active',
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.updateMemberRole({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          memberId: adminMember.id,
          role: 'admin',
        },
      })
    })

    const removedMemberRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: admin.token,
      capabilities: ['project:draft'],
    })

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.removeMember({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          memberIdOrEmail: adminMember.id,
        },
      })
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId: removedMemberRunId,
        sessionTokenForTest: admin.token,
      }),
    ).rejects.toThrow(/Agent run execution denied|User is not a member of the organization/)

    const afterRemovalRows = await t.run(async (ctx) => ({
      run: await ctx.db.get(removedMemberRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(afterRemovalRows.run).toMatchObject({
      status: 'active',
    })
    expect(afterRemovalRows.run?.threadId).toBeUndefined()
    expect(afterRemovalRows.drafts).toHaveLength(0)
    expect(afterRemovalRows.audit).toHaveLength(0)
    expect(afterRemovalRows.usage).toHaveLength(0)
  })

  it('rejects expired active runs before Agent side effects', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, {
        expiresAt: Date.now() - 1,
      })
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is expired')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'active',
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)
  })

  it('does not create agent review rows before a claimed run has a thread', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t)

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId,
        title: 'Unclaimed draft',
        body: 'Should not be created before claim',
      }),
    ).rejects.toThrow('Agent run is not running')

    await markRunRunning(t, agentRunId)

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId,
        title: 'Threadless draft',
        body: 'Should not be created before thread attach',
      }),
    ).rejects.toThrow('Agent run has no thread')

    const rows = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
    }))

    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
  })

  it('rejects invalid delegated run bounds before inserting a run', async () => {
    const t = convexTest(schema, modules)

    await expect(startRun(t, { agentName: '   ' })).rejects.toThrow(
      'Agent run agentName is required',
    )
    await expect(startRun(t, { expiresAt: Date.now() - 1 })).rejects.toThrow(
      'Agent run expiry must be in the future',
    )
    await expect(startRun(t, { maxTotalTokens: 0 })).rejects.toThrow(
      'Agent run maxTotalTokens must be a positive integer',
    )

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(0)
  })

  it('creates draft state and agent audit for delegated tool use', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Draft launch plan',
      body: 'Reviewable project proposal',
    })

    const rows = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
    }))

    expect(rows.drafts).toHaveLength(1)
    expect(rows.drafts[0]).toMatchObject({
      _id: draftId,
      organizationId,
      status: 'pending',
      sourceAgentRunId: agentRunId,
    })
    expect(rows.audit).toHaveLength(1)
    expect(rows.audit[0]).toMatchObject({
      organizationId,
      actor: {
        kind: 'agent',
        agentRunId,
        delegatedByAuthUserId: owner.userId,
      },
      action: 'projectDrafts.create',
      capability: 'project:draft',
      resourceType: 'projectDraft',
      resourceId: draftId,
    })
  })

  it('authorizes callers before an exhausted budget can fail a run or reject review rows', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const member = await createBetterAuthUser(t, 'agent-budget-attacker@example.com')

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.addMember({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          userId: member.userId,
          role: 'member',
        },
      })
    })

    const draftRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
      maxTotalTokens: 1,
    })
    const streamRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:read'],
      maxTotalTokens: 1,
    })

    const reviewRows = await t.run(async (ctx) => {
      const seedExhaustedRun = async (agentRunId: Id<'agentRuns'>, suffix: string) => {
        const pendingDraftId = await ctx.db.insert('projectDrafts', {
          organizationId,
          title: `Pending ${suffix}`,
          body: 'Must remain pending after an unauthorized action call',
          status: 'pending',
          sourceAgentRunId: agentRunId,
          createdAt: Date.now(),
        })
        const approvedDraftId = await ctx.db.insert('projectDrafts', {
          organizationId,
          title: `Approved ${suffix}`,
          body: 'Source record for a pending deletion request',
          status: 'approved',
          sourceAgentRunId: agentRunId,
          createdAt: Date.now(),
          decidedAt: Date.now(),
        })
        const productRecordId = await ctx.db.insert('productRecords', {
          organizationId,
          title: `Record ${suffix}`,
          body: 'Must not be deleted by an unauthorized action call',
          sourceDraftId: approvedDraftId,
          approvedByAuthUserId: owner.userId,
          createdAt: Date.now(),
        })
        const deletionRequestId = await ctx.db.insert('projectDeletionRequests', {
          organizationId,
          productRecordId,
          reason: 'Pending human review',
          status: 'pending',
          sourceAgentRunId: agentRunId,
          createdAt: Date.now(),
        })
        await ctx.db.insert('agentUsageEvents', {
          organizationId,
          agentRunId,
          threadId: `seeded-${suffix}`,
          startedByAuthUserId: owner.userId,
          model: 'seeded-model',
          provider: 'seeded-provider',
          promptTokens: 1,
          completionTokens: 0,
          totalTokens: 1,
          createdAt: Date.now(),
        })

        return { pendingDraftId, deletionRequestId }
      }

      return {
        draft: await seedExhaustedRun(draftRunId, 'draft-run'),
        stream: await seedExhaustedRun(streamRunId, 'stream-run'),
      }
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId: draftRunId,
      }),
    ).rejects.toThrow()
    await expect(
      t.action(publicApi.agentTools.streamProjectSummary, {
        agentRunId: streamRunId,
        sessionTokenForTest: member.token,
      }),
    ).rejects.toThrow('Only the delegating user can execute an agent run')

    const rows = await t.run(async (ctx) => ({
      draftRun: await ctx.db.get(draftRunId),
      streamRun: await ctx.db.get(streamRunId),
      draft: await ctx.db.get(reviewRows.draft.pendingDraftId),
      draftDeletion: await ctx.db.get(reviewRows.draft.deletionRequestId),
      streamDraft: await ctx.db.get(reviewRows.stream.pendingDraftId),
      streamDeletion: await ctx.db.get(reviewRows.stream.deletionRequestId),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.draftRun).toMatchObject({ status: 'active' })
    expect(rows.streamRun).toMatchObject({ status: 'active' })
    for (const reviewRow of [
      rows.draft,
      rows.draftDeletion,
      rows.streamDraft,
      rows.streamDeletion,
    ]) {
      expect(reviewRow).toMatchObject({ status: 'pending' })
      expect(reviewRow?.decidedAt).toBeUndefined()
    }
    expect(rows.usage).toHaveLength(2)
  })

  it('rejects pending review rows when an agent run fails', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const alreadyRejectedRecordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft', 'project:delete'],
    })
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Failed run draft',
      body: 'This review row should not stay pending',
    })
    const deletionRequestId = await t.mutation(
      internalApi.projectDeletionRequests.createFromAgent,
      {
        agentRunId,
        productRecordId: recordId,
        reason: 'Failed run deletion request',
      },
    )
    const alreadyRejectedDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Already rejected failed run draft',
      body: 'This row is already decided before the run fails',
    })
    const alreadyRejectedDeletionRequestId = await t.mutation(
      internalApi.projectDeletionRequests.createFromAgent,
      {
        agentRunId,
        productRecordId: alreadyRejectedRecordId,
        reason: 'Already rejected failed run deletion request',
      },
    )

    await t.mutation(publicApi.projectDrafts.reject, {
      draftId: alreadyRejectedDraftId,
      sessionTokenForTest: owner.token,
    })
    await t.mutation(publicApi.projectDeletionRequests.reject, {
      deletionRequestId: alreadyRejectedDeletionRequestId,
      sessionTokenForTest: owner.token,
    })
    const alreadyRejectedBeforeFailure = await t.run(async (ctx) => ({
      draft: await ctx.db.get(alreadyRejectedDraftId),
      deletionRequest: await ctx.db.get(alreadyRejectedDeletionRequestId),
    }))

    await t.mutation(internalApi.agentRuns.failRun, {
      agentRunId,
    })

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      draft: await ctx.db.get(draftId),
      alreadyRejectedDraft: await ctx.db.get(alreadyRejectedDraftId),
      deletionRequest: await ctx.db.get(deletionRequestId),
      alreadyRejectedDeletionRequest: await ctx.db.get(alreadyRejectedDeletionRequestId),
      record: await ctx.db.get(recordId),
      alreadyRejectedRecord: await ctx.db.get(alreadyRejectedRecordId),
    }))
    const pendingDrafts = await t.query(publicApi.projectDrafts.listPending, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const pendingDeletionRequests = await t.query(publicApi.projectDeletionRequests.listPending, {
      organizationId,
      sessionTokenForTest: owner.token,
    })

    expect(rows.run).toMatchObject({
      status: 'failed',
    })
    expect(rows.draft).toMatchObject({
      status: 'rejected',
    })
    expect((rows.draft as Doc<'projectDrafts'> | null)?.decidedAt).toBeTypeOf('number')
    expect(rows.alreadyRejectedDraft).toMatchObject({
      status: 'rejected',
      decidedAt: (alreadyRejectedBeforeFailure.draft as Doc<'projectDrafts'> | null)?.decidedAt,
    })
    expect(rows.deletionRequest).toMatchObject({
      status: 'rejected',
    })
    expect((rows.deletionRequest as Doc<'projectDeletionRequests'> | null)?.decidedAt).toBeTypeOf(
      'number',
    )
    expect(rows.alreadyRejectedDeletionRequest).toMatchObject({
      status: 'rejected',
      decidedAt: (
        alreadyRejectedBeforeFailure.deletionRequest as Doc<'projectDeletionRequests'> | null
      )?.decidedAt,
    })
    expect(rows.record).not.toBeNull()
    expect(rows.alreadyRejectedRecord).not.toBeNull()
    expect(pendingDrafts).toHaveLength(0)
    expect(pendingDeletionRequests).toHaveLength(0)

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be approved')
  })

  it('keeps agent output out of canonical product state until human approval', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Draft launch plan',
      body: 'Reviewable project proposal',
    })

    const records = await t.run(async (ctx) => await ctx.db.query('productRecords').take(10))
    expect(records).toHaveLength(0)

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId,
        approvedByAuthUserId: 'spoofed-approver',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `approvedByAuthUserId`')

    const beforeApprovalAfterSpoof = await t.run(async (ctx) => ({
      draft: await ctx.db.get(draftId),
      records: await ctx.db.query('productRecords').take(10),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(beforeApprovalAfterSpoof.draft).toMatchObject({
      status: 'pending',
    })
    expect(beforeApprovalAfterSpoof.records).toHaveLength(0)
    expect(beforeApprovalAfterSpoof.audit).toHaveLength(0)

    const recordId = await t.mutation(publicApi.projectDrafts.approve, {
      draftId,
      sessionTokenForTest: owner.token,
    })

    const rows = await t.run(async (ctx) => ({
      draft: await ctx.db.get(draftId),
      records: await ctx.db.query('productRecords').take(10),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))

    expect(rows.draft).toMatchObject({
      status: 'approved',
    })
    expect(rows.records).toHaveLength(1)
    expect(rows.records[0]).toMatchObject({
      _id: recordId,
      organizationId,
      sourceDraftId: draftId,
      approvedByAuthUserId: owner.userId,
    })
    expect(rows.audit).toHaveLength(1)
    expect(rows.audit[0]).toMatchObject({
      organizationId,
      actor: {
        kind: 'user',
        authUserId: owner.userId,
      },
      action: 'projectDrafts.approve',
      resourceType: 'productRecord',
      resourceId: recordId,
      sourceDraftId: draftId,
    })
  })

  it('rejects blank agent-created review state before inserting rows', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const draftRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: draftRunId,
        title: '   ',
        body: 'Reviewable body',
      }),
    ).rejects.toThrow('Draft title and body are required')
    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: draftRunId,
        title: 'Reviewable title',
        body: '   ',
      }),
    ).rejects.toThrow('Draft title and body are required')

    const afterInvalidDrafts = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      agentAudit: await ctx.db.query('agentAuditEvents').take(10),
    }))
    expect(afterInvalidDrafts.drafts).toHaveLength(0)
    expect(afterInvalidDrafts.agentAudit).toHaveLength(0)

    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: '   ',
      }),
    ).rejects.toThrow('Deletion reason is required')

    const afterInvalidDeletion = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      deletionRequests: await ctx.db.query('projectDeletionRequests').take(10),
      agentAudit: await ctx.db.query('agentAuditEvents').take(10),
    }))
    expect(afterInvalidDeletion.record).not.toBeNull()
    expect(afterInvalidDeletion.deletionRequests).toHaveLength(0)
    expect(
      afterInvalidDeletion.agentAudit.filter(
        (event) => event.action === 'projectDeletionRequests.create',
      ),
    ).toHaveLength(0)
  })

  it('rejects draft approval when Better Auth organization permission fails', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const outsider = await createBetterAuthUser(t, 'draft-outsider@example.com')
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Unauthorized approval',
      body: 'This should stay pending',
    })

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId,
        sessionTokenForTest: outsider.token,
      }),
    ).rejects.toThrow(/Missing project:create permission|User is not a member of the organization/)

    const rows = await t.run(async (ctx) => ({
      draft: await ctx.db.get(draftId),
      records: await ctx.db.query('productRecords').take(10),
    }))

    expect(rows.draft).toMatchObject({
      status: 'pending',
    })
    expect(rows.records).toHaveLength(0)
  })

  it('does not decide cross-organization draft or deletion request ids', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const otherOwner = await createBetterAuthUser(t, 'other-approval-owner@example.com')
    const otherOrganizationId = await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      const organization = await auth.api.createOrganization({
        headers: new Headers({ cookie: otherOwner.sessionCookie }),
        body: {
          name: 'Other Approval Org',
          slug: `other-approval-org-${Math.random().toString(36).slice(2)}`,
        },
      })
      return organization.id
    })
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })
    await markRunRunningWithThread(t, agentRunId)
    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Tenant-bound draft',
      body: 'Only the owning organization can approve this draft',
    })
    const recordId = await t.mutation(publicApi.projectDrafts.approve, {
      draftId,
      sessionTokenForTest: owner.token,
    })
    const pendingDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Pending tenant-bound draft',
      body: 'Wrong organization id must not approve this draft',
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)
    const deletionRequestId = await t.mutation(
      internalApi.projectDeletionRequests.createFromAgent,
      {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: 'Tenant-bound deletion request',
      },
    )

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        organizationId: otherOrganizationId,
        draftId: pendingDraftId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow()

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        organizationId: otherOrganizationId,
        deletionRequestId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow()

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId: pendingDraftId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Missing project:create permission|User is not a member of the organization/)

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Missing project:delete permission|User is not a member of the organization/)

    await expect(
      t.mutation(publicApi.projectDrafts.reject, {
        draftId: pendingDraftId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Missing project:create permission|User is not a member of the organization/)

    await expect(
      t.mutation(publicApi.projectDeletionRequests.reject, {
        deletionRequestId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Missing project:delete permission|User is not a member of the organization/)

    const rows = await t.run(async (ctx) => ({
      draft: await ctx.db.get(pendingDraftId),
      record: await ctx.db.get(recordId),
      deletionRequest: await ctx.db.get(deletionRequestId),
      otherRecords: await ctx.db
        .query('productRecords')
        .withIndex('by_org', (q) => q.eq('organizationId', otherOrganizationId))
        .collect(),
    }))

    expect(rows.draft).toMatchObject({
      organizationId,
      status: 'pending',
    })
    expect(rows.record).not.toBeNull()
    expect(rows.deletionRequest).toMatchObject({
      organizationId,
      status: 'pending',
    })
    expect(rows.otherRecords).toHaveLength(0)
  })

  it('gates approval queue reads with Better Auth organization permissions', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const outsider = await createBetterAuthUser(t, 'approval-queue-outsider@example.com')
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Reviewable draft',
      body: 'Visible only to organization readers',
    })
    const recordId = await t.mutation(publicApi.projectDrafts.approve, {
      draftId,
      sessionTokenForTest: owner.token,
    })
    const pendingDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Pending draft',
      body: 'Still awaiting review',
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)
    const deletionRequestId = await t.mutation(
      internalApi.projectDeletionRequests.createFromAgent,
      {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: 'Review deletion',
      },
    )

    const drafts = await t.query(publicApi.projectDrafts.listPending, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deletionRequests = await t.query(publicApi.projectDeletionRequests.listPending, {
      organizationId,
      sessionTokenForTest: owner.token,
    })

    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      _id: pendingDraftId,
      organizationId,
      status: 'pending',
    })
    expect(deletionRequests).toHaveLength(1)
    expect(deletionRequests[0]).toMatchObject({
      _id: deletionRequestId,
      organizationId,
      status: 'pending',
      productRecordId: recordId,
    })

    await expect(
      t.query(publicApi.projectDrafts.listPending, {
        organizationId,
        sessionTokenForTest: outsider.token,
      }),
    ).rejects.toThrow(/Missing project:read permission|User is not a member of the organization/)
    await expect(
      t.query(publicApi.projectDeletionRequests.listPending, {
        organizationId: 'other-better-auth-org-id',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow(/Missing project:read permission|User is not a member of the organization/)
  })

  it('does not promote or reject already-decided drafts', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })
    await markRunRunningWithThread(t, agentRunId)

    const rejectedDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Reject me',
      body: 'Rejected proposal',
    })

    await expect(
      t.mutation(publicApi.projectDrafts.reject, {
        draftId: rejectedDraftId,
        rejectedByAuthUserId: 'spoofed-rejecter',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `rejectedByAuthUserId`')

    const beforeDraftRejectionAfterSpoof = await t.run(async (ctx) => ({
      draft: await ctx.db.get(rejectedDraftId),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(beforeDraftRejectionAfterSpoof.draft).toMatchObject({
      status: 'pending',
    })
    expect(beforeDraftRejectionAfterSpoof.audit).toHaveLength(0)

    await t.mutation(publicApi.projectDrafts.reject, {
      draftId: rejectedDraftId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId: rejectedDraftId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be approved')

    await expect(
      t.mutation(publicApi.projectDrafts.reject, {
        draftId: rejectedDraftId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be rejected')

    const approvedDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Approve once',
      body: 'Approved proposal',
    })

    await t.mutation(publicApi.projectDrafts.approve, {
      draftId: approvedDraftId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId: approvedDraftId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be approved')

    await expect(
      t.mutation(publicApi.projectDrafts.reject, {
        draftId: approvedDraftId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be rejected')

    const rows = await t.run(async (ctx) => ({
      records: await ctx.db.query('productRecords').take(10),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(rows.records).toHaveLength(1)
    expect(rows.audit).toHaveLength(2)
    expect(rows.audit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'user',
          authUserId: owner.userId,
        },
        action: 'projectDrafts.reject',
        resourceType: 'projectDraft',
        resourceId: rejectedDraftId,
        sourceDraftId: rejectedDraftId,
      }),
    )
  })

  it('keeps destructive agent actions pending until human approval', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        organizationId: 'ignored-internal-org',
        productRecordId: recordId,
        reason: 'Old shape',
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    await markRunRunningWithThread(t, deleteRunId)

    const requestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: recordId,
      reason: 'Duplicate project record',
    })

    const beforeApproval = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      requests: await ctx.db.query('projectDeletionRequests').take(10),
      agentAudit: await ctx.db.query('agentAuditEvents').take(10),
    }))

    expect(beforeApproval.record).not.toBeNull()
    expect(beforeApproval.requests).toHaveLength(1)
    expect(beforeApproval.requests[0]).toMatchObject({
      _id: requestId,
      organizationId,
      productRecordId: recordId,
      status: 'pending',
      sourceAgentRunId: deleteRunId,
    })
    expect(beforeApproval.agentAudit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'agent',
          agentRunId: deleteRunId,
          delegatedByAuthUserId: owner.userId,
        },
        action: 'projectDeletionRequests.create',
        capability: 'project:delete',
        resourceType: 'projectDeletionRequest',
        resourceId: requestId,
      }),
    )

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId: requestId,
        deletedByAuthUserId: 'spoofed-deleter',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `deletedByAuthUserId`')

    const beforeDestructiveApprovalAfterSpoof = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      request: await ctx.db.get(requestId),
      productAudit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(beforeDestructiveApprovalAfterSpoof.record).not.toBeNull()
    expect(beforeDestructiveApprovalAfterSpoof.request).toMatchObject({
      status: 'pending',
    })
    expect(
      beforeDestructiveApprovalAfterSpoof.productAudit.filter(
        (event) => event.action === 'productRecords.delete',
      ),
    ).toHaveLength(0)

    await t.mutation(publicApi.projectDeletionRequests.approve, {
      deletionRequestId: requestId,
      sessionTokenForTest: owner.token,
    })

    const afterApproval = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      requests: await ctx.db.query('projectDeletionRequests').take(10),
      productAudit: await ctx.db.query('productAuditEvents').take(10),
    }))

    expect(afterApproval.record).toBeNull()
    expect(afterApproval.requests[0]).toMatchObject({
      _id: requestId,
      status: 'approved',
    })
    expect(afterApproval.productAudit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'user',
          authUserId: owner.userId,
        },
        action: 'productRecords.delete',
        resourceType: 'productRecord',
        resourceId: recordId,
        sourceDeletionRequestId: requestId,
      }),
    )
  })

  it('keeps only one pending deletion request per product record', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    const requestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: recordId,
      reason: 'Remove duplicate',
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: 'Second request for same record',
      }),
    ).rejects.toThrow('Deletion request already pending')

    const rows = await t.run(async (ctx) => ({
      requests: await ctx.db.query('projectDeletionRequests').take(10),
      agentAudit: await ctx.db.query('agentAuditEvents').take(10),
    }))

    expect(rows.requests).toHaveLength(1)
    expect(rows.requests[0]).toMatchObject({
      _id: requestId,
      productRecordId: recordId,
      status: 'pending',
    })
    expect(
      rows.agentAudit.filter((event) => event.action === 'projectDeletionRequests.create'),
    ).toHaveLength(1)
  })

  it('rejects destructive approval when Better Auth organization permission fails', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const outsider = await createBetterAuthUser(t, 'delete-outsider@example.com')
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    const requestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: recordId,
      reason: 'Unauthorized destructive approval',
    })

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId: requestId,
        sessionTokenForTest: outsider.token,
      }),
    ).rejects.toThrow(/Missing project:delete permission|User is not a member of the organization/)

    const rows = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      request: await ctx.db.get(requestId),
    }))

    expect(rows.record).not.toBeNull()
    expect(rows.request).toMatchObject({
      status: 'pending',
    })
  })

  it('blocks destructive agent tools after the delegating member is downgraded', async () => {
    const t = initConvexTest()
    const { owner, admin, adminMember, organizationId } =
      await createBetterAuthOrganizationWithAdmin(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: admin.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.updateMemberRole({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          memberId: adminMember.id,
          role: 'member',
        },
      })
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: 'Permission changed after delegation',
      }),
    ).rejects.toThrow('Delegating user no longer has project:delete permission')

    const rows = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      requests: await ctx.db.query('projectDeletionRequests').take(10),
    }))

    expect(rows.record).not.toBeNull()
    expect(rows.requests).toHaveLength(0)
  })

  it('re-checks the delegating user after claim and before creating a draft', async () => {
    const t = initConvexTest()
    const { owner, admin, adminMember, organizationId } =
      await createBetterAuthOrganizationWithAdmin(t)
    const draftRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: admin.token,
      capabilities: ['project:draft'],
    })
    await markRunRunningWithThread(t, draftRunId)

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.updateMemberRole({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          memberId: adminMember.id,
          role: 'viewer',
        },
      })
    })

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: draftRunId,
        title: 'Stale delegation',
        body: 'Must not be inserted',
      }),
    ).rejects.toThrow('Delegating user no longer has project:create permission')

    const rows = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
    }))
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
  })

  it('blocks destructive agent tools after the delegating member is removed', async () => {
    const t = initConvexTest()
    const { owner, admin, adminMember, organizationId } =
      await createBetterAuthOrganizationWithAdmin(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: admin.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.removeMember({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          memberIdOrEmail: adminMember.id,
        },
      })
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: 'Member removed after delegation',
      }),
    ).rejects.toThrow('Delegating user is not a current organization member')

    const rows = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      requests: await ctx.db.query('projectDeletionRequests').take(10),
    }))

    expect(rows.record).not.toBeNull()
    expect(rows.requests).toHaveLength(0)
  })

  it('does not apply or reject already-decided deletion requests', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const rejectedRecordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const approvedRecordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    const rejectedRequestId = await t.mutation(
      internalApi.projectDeletionRequests.createFromAgent,
      {
        agentRunId: deleteRunId,
        productRecordId: rejectedRecordId,
        reason: 'Reject this deletion',
      },
    )

    await expect(
      t.mutation(publicApi.projectDeletionRequests.reject, {
        deletionRequestId: rejectedRequestId,
        rejectedByAuthUserId: 'spoofed-rejecter',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `rejectedByAuthUserId`')

    const beforeDeletionRejectionAfterSpoof = await t.run(async (ctx) => ({
      request: await ctx.db.get(rejectedRequestId),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(beforeDeletionRejectionAfterSpoof.request).toMatchObject({
      status: 'pending',
    })
    expect(
      beforeDeletionRejectionAfterSpoof.audit.filter(
        (event) => event.action === 'projectDeletionRequests.reject',
      ),
    ).toHaveLength(0)

    await t.mutation(publicApi.projectDeletionRequests.reject, {
      deletionRequestId: rejectedRequestId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId: rejectedRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be approved')

    await expect(
      t.mutation(publicApi.projectDeletionRequests.reject, {
        deletionRequestId: rejectedRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be rejected')

    expect(await t.run(async (ctx) => await ctx.db.get(rejectedRecordId))).not.toBeNull()

    const approvedRequestId = await t.mutation(
      internalApi.projectDeletionRequests.createFromAgent,
      {
        agentRunId: deleteRunId,
        productRecordId: approvedRecordId,
        reason: 'Approve once',
      },
    )

    await t.mutation(publicApi.projectDeletionRequests.approve, {
      deletionRequestId: approvedRequestId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId: approvedRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be approved')

    await expect(
      t.mutation(publicApi.projectDeletionRequests.reject, {
        deletionRequestId: approvedRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be rejected')

    const rows = await t.run(async (ctx) => ({
      records: await ctx.db.query('productRecords').take(10),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(rows.records).toHaveLength(1)
    expect(rows.records[0]._id).toBe(rejectedRecordId)
    expect(
      rows.audit.filter(
        (event) =>
          event.action === 'productRecords.delete' ||
          event.action === 'projectDeletionRequests.reject',
      ),
    ).toHaveLength(2)
    expect(rows.audit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'user',
          authUserId: owner.userId,
        },
        action: 'projectDeletionRequests.reject',
        resourceType: 'projectDeletionRequest',
        resourceId: rejectedRequestId,
        sourceDeletionRequestId: rejectedRequestId,
      }),
    )
  })

  it('rejects wrong organization and undelegated capabilities', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, {
      capabilities: ['project:draft', 'project:delete'],
    })
    await markRunRunningWithThread(t, agentRunId)
    const otherAgentRunId = await startRun(t, {
      organizationId: 'other-better-auth-org-id',
      capabilities: ['project:draft'],
    })
    const otherRecordId = await t.run(async (ctx) => {
      const otherDraftId = await ctx.db.insert('projectDrafts', {
        organizationId: 'other-better-auth-org-id',
        title: 'Other org draft',
        body: 'Other org body',
        status: 'approved',
        sourceAgentRunId: otherAgentRunId,
        createdAt: Date.now(),
        decidedAt: Date.now(),
      })

      return await ctx.db.insert('productRecords', {
        organizationId: 'other-better-auth-org-id',
        title: 'Other org record',
        body: 'Other org body',
        sourceDraftId: otherDraftId,
        approvedByAuthUserId: 'other-better-auth-user-id',
        createdAt: Date.now(),
      })
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId,
        productRecordId: otherRecordId,
        reason: 'Cross-organization delete attempt',
      }),
    ).rejects.toThrow('Agent run organization mismatch')

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId,
        organizationId: 'other-better-auth-org-id',
        title: 'Wrong org',
        body: 'Blocked',
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    const readOnlyRunId = await startRun(t, { capabilities: ['project:read'] })
    await markRunRunningWithThread(t, readOnlyRunId)
    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: readOnlyRunId,
        title: 'Missing capability',
        body: 'Blocked',
      }),
    ).rejects.toThrow('Agent capability was not delegated')
  })

  it('rejects revoked and expired runs', async () => {
    const t = convexTest(schema, modules)
    const revokedRunId = await startRun(t)

    await t.run(async (ctx) => {
      await ctx.db.patch(revokedRunId, {
        status: 'revoked',
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: revokedRunId,
        title: 'Revoked',
        body: 'Blocked',
      }),
    ).rejects.toThrow('Agent run is not running')

    const expiredRunId = await startRun(t, { expiresAt: Date.now() + 60_000 })
    await markRunRunningWithThread(t, expiredRunId)
    await t.run(async (ctx) => {
      await ctx.db.patch(expiredRunId, {
        expiresAt: Date.now() - 1,
      })
    })
    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: expiredRunId,
        title: 'Expired',
        body: 'Blocked',
      }),
    ).rejects.toThrow('Agent run is expired')
  })
})
