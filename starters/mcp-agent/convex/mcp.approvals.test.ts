import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  convexTest,
  mcpServerSecret,
  seedActor,
  seedHumanMember,
  serviceBearerToken,
  setMcpServerSecret,
} from '../test/mcpTestHelpers'
import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('mcp-agent destructive approval lifecycle', () => {
  let restoreMcpServerSecret: () => void

  beforeEach(() => {
    restoreMcpServerSecret = setMcpServerSecret()
  })

  afterEach(() => {
    restoreMcpServerSecret()
  })

  async function createProjectForDelete() {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId, credentialId } = await seedActor(t, 'admin')
    const ownerId = await seedHumanMember(t, organizationId, 'owner', 'owner')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Delete me',
    })

    return { t, organizationId, serviceActorId, credentialId, ownerId, projectId }
  }

  it('previews project deletion without mutating state', async () => {
    const { t, projectId } = await createProjectForDelete()

    const preview = await t.query(api.projects.previewDeleteFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
    })
    const project = await t.run(async (ctx) => await ctx.db.get(projectId))

    expect(preview).toMatchObject({
      status: 'ready',
      operation: 'projects.delete',
      riskLevel: 'approval_required',
      requiresApproval: true,
      canRequestApproval: true,
      canExecute: false,
    })
    expect(project).toMatchObject({ status: 'active' })
  })

  it('creates one pending approval request and reuses it for idempotent retries', async () => {
    const { t, projectId } = await createProjectForDelete()

    const first = await t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      reason: 'User asked in chat.',
      requestKey: 'chat-request-1',
    })
    const second = await t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      reason: 'Retried after network failure.',
      requestKey: 'chat-request-1',
    })

    expect(second.approvalRequestId).toBe(first.approvalRequestId)
    const approvals = await t.run(async (ctx) => await ctx.db.query('approvals').collect())
    expect(approvals).toHaveLength(1)
    expect(approvals[0]).toMatchObject({
      operation: 'projects.delete',
      resourceId: projectId,
      status: 'pending',
      requestedReason: 'User asked in chat.',
    })
  })

  it('does not create duplicate approvals when a request key is reused after rejection', async () => {
    const { t, projectId } = await createProjectForDelete()
    const first = await t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      requestKey: 'stable-request-key',
    })
    await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.rejectProjectDelete, {
      approvalRequestId: first.approvalRequestId,
      reason: 'Rejected.',
    })

    const second = await t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      requestKey: 'stable-request-key',
    })
    const approvals = await t.run(async (ctx) => await ctx.db.query('approvals').collect())

    expect(second).toMatchObject({
      status: 'blocked',
      reason: 'approval_rejected',
      approvalRequestId: first.approvalRequestId,
    })
    expect(approvals).toHaveLength(1)
  })

  it('does not show expired pending approval requests as actionable app approvals', async () => {
    const { t, organizationId, projectId } = await createProjectForDelete()
    await t.run(async (ctx) => {
      await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: projectId,
        status: 'pending',
        requestedReason: 'Expired pending request.',
        expiresAt: Date.now() - 1,
        createdAt: Date.now() - 60_000,
      })
    })

    const pending = await t
      .withIdentity({ subject: 'owner' })
      .query(api.approvals.listPending, { organizationId })

    expect(pending).toEqual([])
  })

  it('only active organization admins can approve or reject pending delete requests', async () => {
    const { t, organizationId, projectId } = await createProjectForDelete()
    await seedHumanMember(t, organizationId, 'member', 'member')
    const request = await t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
    })

    await expect(
      t.withIdentity({ subject: 'member' }).mutation(api.approvals.approveProjectDelete, {
        approvalRequestId: request.approvalRequestId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.approveProjectDelete, {
      approvalRequestId: request.approvalRequestId,
    })
    const approval = await t.run(async (ctx) => await ctx.db.get(request.approvalRequestId))
    expect(approval).toMatchObject({ status: 'approved' })
    expect(approval?.approvedBy).toBeTruthy()
    expect(approval?.approvedAt).toBeTypeOf('number')

    await expect(
      t.withIdentity({ subject: 'owner' }).mutation(api.approvals.rejectProjectDelete, {
        approvalRequestId: request.approvalRequestId,
      }),
    ).rejects.toThrow('Approval request is not pending')
  })

  it('reports approval status to the same service actor organization', async () => {
    const { t, projectId } = await createProjectForDelete()
    const request = await t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
    })

    const pending = await t.query(api.approvals.getForServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      approvalRequestId: request.approvalRequestId,
    })
    expect(pending).toMatchObject({
      approvalRequestId: request.approvalRequestId,
      status: 'pending',
      resourceId: projectId,
    })

    await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.approveProjectDelete, {
      approvalRequestId: request.approvalRequestId,
    })
    const approved = await t.query(api.approvals.getForServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      approvalRequestId: request.approvalRequestId,
    })
    expect(approved).toMatchObject({ status: 'approved' })
    expect(approved.nextActions[0]).toMatchObject({
      tool: 'projects.delete.execute',
    })
  })

  it('rejects rejected, expired, reused, and mismatched approvals at execute time', async () => {
    const { t, organizationId, ownerId, projectId } = await createProjectForDelete()
    const rejected = await t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      requestKey: 'rejected',
    })
    await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.rejectProjectDelete, {
      approvalRequestId: rejected.approvalRequestId,
      reason: 'No longer needed.',
    })

    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        approvalId: rejected.approvalRequestId,
      }),
    ).rejects.toThrow('Approval required')

    const expiredApprovalId = await t.run(async (ctx) => {
      return await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: projectId,
        status: 'approved',
        requestedReason: 'Expired.',
        approvedBy: ownerId,
        approvedAt: Date.now() - 10_000,
        expiresAt: Date.now() - 1,
        createdAt: Date.now() - 20_000,
      })
    })
    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        approvalId: expiredApprovalId,
      }),
    ).rejects.toThrow('Approval required')

    const approved = await t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      requestKey: 'approved',
    })
    await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.approveProjectDelete, {
      approvalRequestId: approved.approvalRequestId,
    })
    const otherProjectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Other project',
    })
    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId: otherProjectId,
        approvalId: approved.approvalRequestId,
      }),
    ).rejects.toThrow('Approval required')

    await t.mutation(api.projects.deleteWithApproval, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      approvalId: approved.approvalRequestId,
    })
    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        approvalId: approved.approvalRequestId,
      }),
    ).rejects.toThrow('Project not found')
  })

  it('re-checks service actor role and credential status after approval', async () => {
    const { t, serviceActorId, credentialId, projectId } = await createProjectForDelete()
    const roleDowngradeRequest = await t.mutation(
      api.projects.requestDeleteApprovalFromServiceActor,
      {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        requestKey: 'role-downgrade',
      },
    )
    await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.approveProjectDelete, {
      approvalRequestId: roleDowngradeRequest.approvalRequestId,
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(serviceActorId, { role: 'viewer' })
    })

    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        approvalId: roleDowngradeRequest.approvalRequestId,
      }),
    ).rejects.toThrow('Insufficient service actor role')

    await t.run(async (ctx) => {
      await ctx.db.patch(serviceActorId, { role: 'admin' })
      await ctx.db.patch(credentialId, { status: 'revoked', revokedAt: Date.now() })
    })

    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        approvalId: roleDowngradeRequest.approvalRequestId,
      }),
    ).rejects.toThrow('Service actor credential denied')
  })

  it('soft-deletes approved projects, hides them from lists, and records audit details', async () => {
    const { t, organizationId, serviceActorId, projectId } = await createProjectForDelete()
    const request = await t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
    })
    await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.approveProjectDelete, {
      approvalRequestId: request.approvalRequestId,
    })

    const result = await t.mutation(api.projects.deleteWithApproval, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      approvalId: request.approvalRequestId,
    })

    expect(result).toMatchObject({
      status: 'executed',
      operation: 'projects.delete',
      projectId,
      approvalId: request.approvalRequestId,
    })
    const visibleProjects = await t.query(api.projects.listForServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
    })
    const { project, approval, auditEvents } = await t.run(async (ctx) => ({
      project: await ctx.db.get(projectId),
      approval: await ctx.db.get(request.approvalRequestId),
      auditEvents: await ctx.db
        .query('auditEvents')
        .withIndex('by_org_created', (q) => q.eq('organizationId', organizationId))
        .collect(),
    }))

    expect(visibleProjects.some((project) => project._id === projectId)).toBe(false)
    expect(project).toMatchObject({
      status: 'deleted',
      deletedBy: serviceActorId,
    })
    expect(project?.deletedAt).toBeTypeOf('number')
    expect(approval).toMatchObject({ status: 'used' })
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        organizationId,
        serviceActorId,
        action: 'projects.delete',
        resourceType: 'project',
        source: 'mcp',
        resourceId: projectId,
      }),
    )
  })
})
