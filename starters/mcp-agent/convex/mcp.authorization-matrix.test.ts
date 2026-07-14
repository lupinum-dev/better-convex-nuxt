import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  convexTest,
  mcpServerSecret,
  seedActor,
  serviceBearerToken,
  setMcpServerSecret,
} from '../test/mcpTestHelpers'
import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('mcp-agent public authorization matrix', () => {
  let restoreMcpServerSecret: () => void

  beforeEach(() => {
    restoreMcpServerSecret = setMcpServerSecret()
  })

  afterEach(() => {
    restoreMcpServerSecret()
  })

  it('binds user projection and organization creation to the authenticated subject', async () => {
    const t = convexTest(schema, modules)

    await expect(t.mutation(api.users.upsertCurrent, {})).rejects.toThrow('Unauthenticated')
    await expect(t.query(api.users.getCurrent, {})).rejects.toThrow('Unauthenticated')
    await expect(
      t.mutation(api.organizations.create, { name: 'Anonymous Organization' }),
    ).rejects.toThrow('Unauthenticated')
    await expect(
      t.withIdentity({ subject: 'unprojected' }).mutation(api.organizations.create, {
        name: 'Unprojected Organization',
      }),
    ).rejects.toThrow('User not found')

    const alice = t.withIdentity({
      subject: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
    })
    const aliceUserId = await alice.mutation(api.users.upsertCurrent, {})
    const organizationId = await alice.mutation(api.organizations.create, {
      name: 'Alice Organization',
    })

    const bob = t.withIdentity({
      subject: 'bob',
      name: 'Bob',
      email: 'bob@example.com',
    })
    const bobUserId = await bob.mutation(api.users.upsertCurrent, {})

    expect(bobUserId).not.toBe(aliceUserId)
    await expect(alice.query(api.users.getCurrent, {})).resolves.toMatchObject({
      _id: aliceUserId,
      subject: 'alice',
    })
    await expect(bob.query(api.users.getCurrent, {})).resolves.toMatchObject({
      _id: bobUserId,
      subject: 'bob',
    })

    const { ownerMembership, auditEvents } = await t.run(async (ctx) => ({
      ownerMembership: await ctx.db
        .query('memberships')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', organizationId).eq('userId', aliceUserId),
        )
        .unique(),
      auditEvents: await ctx.db
        .query('auditEvents')
        .withIndex('by_org_created', (q) => q.eq('organizationId', organizationId))
        .collect(),
    }))
    expect(ownerMembership).toMatchObject({ role: 'owner', status: 'active' })
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        actor: { kind: 'user', userId: aliceUserId },
        action: 'organizations.create',
        resourceType: 'organization',
        resourceId: organizationId,
      }),
    )
  })

  it('rechecks server, credential, actor, tenant, and role authority for create previews', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId, credentialId } = await seedActor(t, 'member')

    await expect(
      t.query(api.projects.previewCreateFromServiceActor, {
        serverSecret: 'wrong-but-deliberately-long-server-secret',
        bearerToken: serviceBearerToken,
        name: 'Blocked Preview',
      }),
    ).rejects.toThrow('MCP server authorization required')

    const preview = await t.query(api.projects.previewCreateFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: '  Previewed Project  ',
    })
    expect(preview).toMatchObject({
      status: 'ready',
      operation: 'projects.create',
      normalizedInput: { name: 'Previewed Project' },
      actor: { id: serviceActorId, role: 'member' },
      resource: { organizationId },
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(serviceActorId, { role: 'viewer' })
    })
    await expect(
      t.query(api.projects.previewCreateFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        name: 'Viewer Preview',
      }),
    ).rejects.toThrow('Insufficient service actor role')

    await t.run(async (ctx) => {
      await ctx.db.patch(serviceActorId, { role: 'member' })
      await ctx.db.patch(credentialId, { status: 'revoked', revokedAt: Date.now() })
    })
    await expect(
      t.query(api.projects.previewCreateFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        name: 'Revoked Credential Preview',
      }),
    ).rejects.toThrow('Service actor credential denied')

    await t.run(async (ctx) => {
      await ctx.db.patch(credentialId, { status: 'active', revokedAt: undefined })
      await ctx.db.patch(serviceActorId, { status: 'revoked' })
    })
    await expect(
      t.query(api.projects.previewCreateFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        name: 'Revoked Actor Preview',
      }),
    ).rejects.toThrow('Service actor denied')
  })

  it('directly denies uncovered organization, approval, and delete-preview reads', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'admin')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Protected Project',
    })

    await expect(t.query(api.organizations.listMine, {})).rejects.toThrow('Unauthenticated')
    await expect(t.query(api.approvals.listPending, { organizationId })).rejects.toThrow(
      'Unauthenticated',
    )
    await expect(
      t.query(api.projects.previewDeleteFromServiceActor, {
        serverSecret: 'wrong-but-deliberately-long-server-secret',
        bearerToken: serviceBearerToken,
        projectId,
      }),
    ).rejects.toThrow('MCP server authorization required')
  })
})
