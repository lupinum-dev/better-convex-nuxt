import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

async function seedActor(
  t: ReturnType<typeof convexTest>,
  role: 'owner' | 'admin' | 'member' | 'viewer',
  status: 'active' | 'revoked' = 'active'
) {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      createdAt: Date.now()
    })
    const serviceActorId = await ctx.db.insert('serviceActors', {
      organizationId,
      name: 'MCP',
      role,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    await ctx.db.insert('agentCredentials', {
      organizationId,
      serviceActorId,
      secretHash: 'hash',
      status: 'active',
      createdAt: Date.now()
    })
    return { organizationId, serviceActorId }
  })
}

describe('mcp-agent starter invariants', () => {
  it('valid service actor can call exposed read tool function', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')

    const projects = await t.query(api.projects.listForServiceActor, {
      credentialHash: 'hash',
      organizationId
    })

    expect(projects).toEqual([])
  })

  it('valid service actor can call exposed write tool function', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'member')

    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
      name: 'Launch'
    })

    expect(projectId).toBeTruthy()
  })

  it('revoked credential fails', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'member')
    await t.run(async (ctx) => {
      const credential = await ctx.db
        .query('agentCredentials')
        .withIndex('by_secret_hash', (q) => q.eq('secretHash', 'hash'))
        .unique()
      await ctx.db.patch(credential!._id, { status: 'revoked', revokedAt: Date.now() })
    })

    await expect(
      t.query(api.projects.listForServiceActor, {
        credentialHash: 'hash',
        organizationId
      })
    ).rejects.toThrow('Service actor credential denied')
  })

  it('tool args cannot target another organization', async () => {
    const t = convexTest(schema, modules)
    await seedActor(t, 'member')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now()
      })
    })

    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        credentialHash: 'hash',
        organizationId: otherOrganizationId,
        name: 'Blocked'
      })
    ).rejects.toThrow('Service actor credential denied')
  })

  it('Convex re-checks changed actor role at execution time', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'member')

    await t.run(async (ctx) => {
      await ctx.db.patch(serviceActorId, { role: 'viewer' })
    })

    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        credentialHash: 'hash',
        organizationId,
        name: 'Blocked'
      })
    ).rejects.toThrow('Insufficient service actor role')
  })

  it('sensitive write requires approval', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'admin')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
      name: 'Delete me'
    })

    const approvalId = await t.run(async (ctx) => {
      return await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: projectId,
        status: 'pending',
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now()
      })
    })

    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        credentialHash: 'hash',
        organizationId,
        projectId,
        approvalId
      })
    ).rejects.toThrow('Approval required')

    await t.run(async (ctx) => {
      await ctx.db.patch(approvalId, { status: 'approved' })
    })

    await t.mutation(api.projects.deleteWithApproval, {
      credentialHash: 'hash',
      organizationId,
      projectId,
      approvalId
    })

    const deleted = await t.run(async (ctx) => await ctx.db.get(projectId))
    expect(deleted).toBeNull()
  })
})
