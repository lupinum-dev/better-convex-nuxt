import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createMcpProjectRequestSchema,
  createOrganizationInputSchema,
  createServiceActorInputSchema,
} from '../shared/inputSchemas'
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

describe('mcp-agent resource bounds', () => {
  let restoreMcpServerSecret: () => void

  beforeEach(() => {
    restoreMcpServerSecret = setMcpServerSecret()
  })

  afterEach(() => {
    restoreMcpServerSecret()
  })

  it('keeps shared organization, actor, and bearer inputs bounded', () => {
    expect(createOrganizationInputSchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false)
    expect(
      createServiceActorInputSchema.safeParse({ name: 'x'.repeat(121), role: 'member' }).success,
    ).toBe(false)
    expect(
      createMcpProjectRequestSchema.safeParse({
        bearerToken: 'x'.repeat(257),
        name: 'Project',
      }).success,
    ).toBe(false)
  })

  it('caps organization, membership, actor, project, and approval lists', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'admin')
    const ownerUserId = await seedHumanMember(t, organizationId, 'owner', 'owner')

    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index += 1) {
        const userId = await ctx.db.insert('users', {
          subject: `member-${index}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        await ctx.db.insert('memberships', {
          organizationId,
          userId,
          role: 'member',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        await ctx.db.insert('serviceActors', {
          organizationId,
          name: `Actor ${index}`,
          role: 'viewer',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        await ctx.db.insert('projects', {
          organizationId,
          name: `Project ${index}`,
          createdBy: { kind: 'serviceActor', serviceActorId },
          status: 'active',
          createdAt: Date.now(),
        })
        await ctx.db.insert('approvals', {
          organizationId,
          operation: 'projects.delete',
          resourceId: `project-${index}`,
          status: 'pending',
          requestedBy: serviceActorId,
          expiresAt: Date.now() + 60_000,
          createdAt: Date.now(),
        })
      }
    })
    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index += 1) {
        const extraOrganizationId = await ctx.db.insert('organizations', {
          name: `Organization ${index}`,
          createdAt: Date.now(),
        })
        await ctx.db.insert('memberships', {
          organizationId: extraOrganizationId,
          userId: ownerUserId,
          role: 'owner',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }
    })

    const asOwner = t.withIdentity({ subject: 'owner' })
    expect(await asOwner.query(api.organizations.listMine, {})).toHaveLength(100)
    expect(
      await asOwner.query(api.memberships.listForOrganization, { organizationId }),
    ).toHaveLength(100)
    expect(
      await asOwner.query(api.serviceActors.listForOrganization, { organizationId }),
    ).toHaveLength(100)
    expect(await asOwner.query(api.projects.listForCurrentUser, { organizationId })).toHaveLength(
      100,
    )
    expect(await asOwner.query(api.approvals.listPending, { organizationId })).toHaveLength(100)
  })

  it('does not let expired approvals or deleted projects consume active result limits', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'admin')
    await seedHumanMember(t, organizationId, 'owner', 'owner')
    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index += 1) {
        await ctx.db.insert('projects', {
          organizationId,
          name: `Deleted ${index}`,
          createdBy: { kind: 'serviceActor', serviceActorId },
          status: 'deleted',
          deletedAt: Date.now(),
          deletedBy: serviceActorId,
          createdAt: Date.now(),
        })
        await ctx.db.insert('approvals', {
          organizationId,
          operation: 'projects.delete',
          resourceId: `expired-${index}`,
          status: 'pending',
          requestedBy: serviceActorId,
          expiresAt: Date.now() - 1,
          createdAt: Date.now(),
        })
      }
      await ctx.db.insert('projects', {
        organizationId,
        name: 'Active',
        createdBy: { kind: 'serviceActor', serviceActorId },
        status: 'active',
        createdAt: 0,
      })
      await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: 'active-project',
        status: 'pending',
        requestedBy: serviceActorId,
        expiresAt: Date.now() + 60_000,
        createdAt: 0,
      })
    })

    const asOwner = t.withIdentity({ subject: 'owner' })
    expect(await asOwner.query(api.projects.listForCurrentUser, { organizationId })).toEqual([
      expect.objectContaining({ name: 'Active', status: 'active' }),
    ])
    expect(await asOwner.query(api.approvals.listPending, { organizationId })).toEqual([
      expect.objectContaining({ resourceId: 'active-project', status: 'pending' }),
    ])
  })

  it('rejects oversized credential, request-key, and reason inputs', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'admin')
    await seedHumanMember(t, organizationId, 'owner', 'owner')
    const projectId = await t.run(async (ctx) => {
      return await ctx.db.insert('projects', {
        organizationId,
        name: 'Project',
        createdBy: { kind: 'serviceActor', serviceActorId },
        status: 'active',
        createdAt: Date.now(),
      })
    })

    await expect(
      t.query(api.projects.listForServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: 'x'.repeat(257),
      }),
    ).rejects.toThrow('Service actor credential denied')
    await expect(
      t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        requestKey: 'x'.repeat(121),
      }),
    ).rejects.toThrow('Request key must be 120 characters or less')
    await expect(
      t.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        projectId,
        reason: 'x'.repeat(1_001),
      }),
    ).rejects.toThrow('Approval reason must be 1000 characters or less')

    const approvalRequestId = await t.run(async (ctx) => {
      return await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: projectId,
        status: 'pending',
        requestedBy: serviceActorId,
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
      })
    })
    await expect(
      t.withIdentity({ subject: 'owner' }).mutation(api.approvals.rejectProjectDelete, {
        approvalRequestId,
        reason: 'x'.repeat(1_001),
      }),
    ).rejects.toThrow('Rejection reason must be 1000 characters or less')
  })
})
