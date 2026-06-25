import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  convexTest,
  mcpServerSecret,
  readRateLimitError,
  seedActor,
  seedHumanMember,
  serviceBearerToken,
  setMcpServerSecret,
} from '../test/mcpTestHelpers'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

describe('mcp-agent destructive approvals', () => {
  let restoreMcpServerSecret: () => void

  beforeEach(() => {
    restoreMcpServerSecret = setMcpServerSecret()
  })

  afterEach(() => {
    restoreMcpServerSecret()
  })

  it('sensitive write requires approval', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'admin')
    const ownerId = await seedHumanMember(t, organizationId, 'owner', 'owner')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Delete me',
    })

    const approvalId = await t.run(async (ctx) => {
      return await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: projectId,
        status: 'used',
        approvedBy: ownerId,
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
        usedAt: Date.now(),
      })
    })

    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        approvalId,
      }),
    ).rejects.toThrow('Approval required')

    await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.approveProjectDelete, {
      projectId,
    })

    const approvedApproval = await t.run(async (ctx) => {
      return await ctx.db
        .query('approvals')
        .withIndex('by_operation_resource', (q) =>
          q.eq('operation', 'projects.delete').eq('resourceId', projectId),
        )
        .filter((q) => q.eq(q.field('status'), 'approved'))
        .unique()
    })
    expect(approvedApproval).toMatchObject({
      organizationId,
      operation: 'projects.delete',
      resourceId: projectId,
      status: 'approved',
    })
    expect(approvedApproval?.approvedBy).toBeTruthy()

    await t.mutation(api.projects.deleteWithApproval, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      approvalId: approvedApproval!._id,
    })

    const deleted = await t.run(async (ctx) => await ctx.db.get(projectId))
    expect(deleted).toBeNull()
  })

  it('only an active organization admin can approve destructive project actions', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'admin')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'admin', 'admin')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Delete me',
    })

    await expect(
      t.withIdentity({ subject: 'member' }).mutation(api.approvals.approveProjectDelete, {
        projectId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const approvalId = await t
      .withIdentity({ subject: 'admin' })
      .mutation(api.approvals.approveProjectDelete, {
        projectId,
      })
    const approval = await t.run(async (ctx) => await ctx.db.get(approvalId))
    expect(approval).toMatchObject({
      organizationId,
      operation: 'projects.delete',
      resourceId: projectId,
      status: 'approved',
    })
    expect(approval?.approvedBy).toBeTruthy()
  })

  it('does not let another organization admin approve destructive project actions', async () => {
    const t = convexTest(schema, modules)
    await seedActor(t, 'admin')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Delete me',
    })
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    await seedHumanMember(t, otherOrganizationId, 'other-admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'other-admin' }).mutation(api.approvals.approveProjectDelete, {
        projectId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const approvals = await t.run(async (ctx) => await ctx.db.query('approvals').collect())
    expect(approvals).toHaveLength(0)
  })

  it('rate limits repeated destructive approvals per organization admin', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'admin')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    const projectIds = await t.run(async (ctx) => {
      const ids: Id<'projects'>[] = []
      for (let index = 0; index < 11; index += 1) {
        ids.push(
          await ctx.db.insert('projects', {
            organizationId,
            name: `Approval ${index}`,
            createdBy: { kind: 'serviceActor', serviceActorId },
            createdAt: Date.now(),
          }),
        )
      }
      return ids
    })

    for (const projectId of projectIds.slice(0, 10)) {
      await t.withIdentity({ subject: 'admin' }).mutation(api.approvals.approveProjectDelete, {
        projectId,
      })
    }

    let error: unknown
    try {
      await t.withIdentity({ subject: 'admin' }).mutation(api.approvals.approveProjectDelete, {
        projectId: projectIds[10]!,
      })
    } catch (caught) {
      error = caught
    }

    expect(readRateLimitError(error)).toMatchObject({
      kind: 'RateLimited',
      name: 'humanProjectDeleteApproval',
    })
  })

  it('rejects expired and reused destructive approvals', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'admin')
    const ownerId = await seedHumanMember(t, organizationId, 'owner', 'owner')
    const expiredProjectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Expired',
    })
    const reusedProjectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Reused',
    })
    const expiredApprovalId = await t.run(async (ctx) => {
      return await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: expiredProjectId,
        status: 'approved',
        approvedBy: ownerId,
        expiresAt: Date.now() - 1,
        createdAt: Date.now(),
      })
    })
    const reusedApprovalId = await t
      .withIdentity({ subject: 'owner' })
      .mutation(api.approvals.approveProjectDelete, {
        projectId: reusedProjectId,
      })

    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId: expiredProjectId,
        approvalId: expiredApprovalId,
      }),
    ).rejects.toThrow('Approval required')

    await t.mutation(api.projects.deleteWithApproval, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId: reusedProjectId,
      approvalId: reusedApprovalId,
    })
    const nextProjectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Next',
    })
    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId: nextProjectId,
        approvalId: reusedApprovalId,
      }),
    ).rejects.toThrow('Approval required')
  })

  it('rejects cross-organization destructive approvals and records delete audit details', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'admin')
    const ownerId = await seedHumanMember(t, organizationId, 'owner', 'owner')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Delete with audit',
    })
    const { foreignApprovalId, foreignProjectId } = await t.run(async (ctx) => {
      const foreignOrganizationId = await ctx.db.insert('organizations', {
        name: 'Foreign',
        createdAt: Date.now(),
      })
      const foreignServiceActorId = await ctx.db.insert('serviceActors', {
        organizationId: foreignOrganizationId,
        name: 'Foreign MCP',
        role: 'admin',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      const foreignProjectId = await ctx.db.insert('projects', {
        organizationId: foreignOrganizationId,
        name: 'Foreign Project',
        createdBy: { kind: 'serviceActor', serviceActorId: foreignServiceActorId },
        createdAt: Date.now(),
      })
      const foreignApprovalId = await ctx.db.insert('approvals', {
        organizationId: foreignOrganizationId,
        operation: 'projects.delete',
        resourceId: projectId,
        status: 'approved',
        approvedBy: ownerId,
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
      })
      return { foreignApprovalId, foreignProjectId }
    })

    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        approvalId: foreignApprovalId,
      }),
    ).rejects.toThrow('Approval required')

    const approvalId = await t
      .withIdentity({ subject: 'owner' })
      .mutation(api.approvals.approveProjectDelete, {
        projectId,
      })
    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId: foreignProjectId,
        approvalId,
      }),
    ).rejects.toThrow('Project not found')

    await t.mutation(api.projects.deleteWithApproval, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      projectId,
      approvalId,
    })

    const { auditEvents, usedApproval } = await t.run(async (ctx) => {
      return {
        auditEvents: await ctx.db
          .query('auditEvents')
          .withIndex('by_org_created', (q) => q.eq('organizationId', organizationId))
          .collect(),
        usedApproval: await ctx.db.get(approvalId),
      }
    })
    expect(usedApproval).toMatchObject({ status: 'used' })
    expect(usedApproval?.usedAt).toBeTypeOf('number')
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
