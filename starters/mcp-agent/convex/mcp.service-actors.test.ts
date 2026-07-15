import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  convexTest,
  readRateLimitError,
  seedActor,
  seedHumanMember,
  serviceBearerHash,
  setMcpServerSecret,
} from '../test/mcpTestHelpers'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

describe('mcp-agent service actor credentials', () => {
  let restoreMcpServerSecret: () => void

  beforeEach(() => {
    restoreMcpServerSecret = setMcpServerSecret()
  })

  afterEach(() => {
    restoreMcpServerSecret()
  })

  it('does not let service actors use the human owner role', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'owner', 'owner')

    await expect(
      t.withIdentity({ subject: 'owner' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Owner Agent',
        role: 'owner' as never,
      }),
    ).rejects.toThrow()

    const serviceActors = await t.run(async (ctx) => {
      return await ctx.db
        .query('serviceActors')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .collect()
    })
    expect(serviceActors.map((actor) => actor.role)).toEqual(['viewer'])
  })

  it('lists service actors for admins without leaking credential hashes', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'member' }).query(api.serviceActors.listForOrganization, {
        organizationId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const actors = await t
      .withIdentity({ subject: 'admin' })
      .query(api.serviceActors.listForOrganization, {
        organizationId,
      })

    expect(actors).toEqual([
      expect.objectContaining({
        id: serviceActorId,
        name: 'MCP',
        role: 'viewer',
        status: 'active',
      }),
    ])
    expect(JSON.stringify(actors)).not.toContain('hash')
    expect(JSON.stringify(actors)).not.toContain('secretHash')
  })

  it('only an active organization admin can create service actors and credentials', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'member', 'member')
    const ownerUserId = await seedHumanMember(t, organizationId, 'owner', 'owner')

    await expect(
      t.withIdentity({ subject: 'member' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Blocked',
        role: 'member',
      }),
    ).rejects.toThrow('Insufficient organization role')

    const created = await t.withIdentity({ subject: 'owner' }).mutation(api.serviceActors.create, {
      organizationId,
      name: '  Build Agent  ',
      role: 'member',
    })
    const { serviceActorId, bearerToken } = created

    const { actor, credential, audit } = await t.run(async (ctx) => {
      const actor = await ctx.db.get(serviceActorId)
      const credential = await ctx.db
        .query('agentCredentials')
        .withIndex('by_actor', (q) => q.eq('serviceActorId', serviceActorId))
        .unique()
      const audit = await ctx.db.query('auditEvents').collect()
      return { actor, credential, audit }
    })
    expect(actor).toMatchObject({
      organizationId,
      name: 'Build Agent',
      role: 'member',
      status: 'active',
    })
    expect(bearerToken).toMatch(/^[a-f0-9]{64}$/)
    expect(credential).toMatchObject({
      organizationId,
      serviceActorId,
      status: 'active',
    })
    expect(credential?.secretHash).toMatch(/^[a-f0-9]{64}$/)
    expect(credential?.secretHash).not.toBe(bearerToken)
    expect(audit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: { kind: 'user', userId: ownerUserId },
        action: 'serviceActors.create',
        resourceType: 'serviceActor',
        resourceId: serviceActorId,
      }),
    )
  })

  it('does not let another organization admin create service actors', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    await seedHumanMember(t, otherOrganizationId, 'other-admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'other-admin' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Blocked',
        role: 'member',
      }),
    ).rejects.toThrow('Insufficient organization role')

    const serviceActors = await t.run(async (ctx) => {
      return await ctx.db
        .query('serviceActors')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .collect()
    })
    expect(serviceActors).toHaveLength(1)
  })

  it('rejects blank service actor names before writing', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'admin' }).mutation(api.serviceActors.create, {
        organizationId,
        name: '   ',
        role: 'member',
      }),
    ).rejects.toThrow('Service actor name is required')

    const serviceActors = await t.run(async (ctx) => {
      return await ctx.db
        .query('serviceActors')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .collect()
    })
    expect(serviceActors.map((actor) => actor.name)).toEqual(['MCP'])
  })

  it('rate limits repeated service actor credential issuance per organization admin', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    for (const [index] of ['c', 'd', 'e', 'f', '1'].entries()) {
      await t.withIdentity({ subject: 'admin' }).mutation(api.serviceActors.create, {
        organizationId,
        name: `Agent ${index}`,
        role: 'member',
      })
    }

    let error: unknown
    try {
      await t.withIdentity({ subject: 'admin' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Blocked Agent',
        role: 'member',
      })
    } catch (caught) {
      error = caught
    }

    expect(readRateLimitError(error)).toMatchObject({
      kind: 'RateLimited',
      name: 'humanServiceActorCreate',
    })

    const serviceActors = await t.run(async (ctx) => {
      return await ctx.db
        .query('serviceActors')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .collect()
    })
    expect(serviceActors).toHaveLength(6)
  })

  it('only an active organization admin can revoke a service actor credential', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, credentialId } = await seedActor(t, 'member')
    await seedHumanMember(t, organizationId, 'member', 'member')
    const adminUserId = await seedHumanMember(t, organizationId, 'admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'member' }).mutation(api.agentCredentials.revoke, {
        credentialId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    await t.withIdentity({ subject: 'admin' }).mutation(api.agentCredentials.revoke, {
      credentialId,
    })

    const { credential, audit } = await t.run(async (ctx) => ({
      credential: await ctx.db.get(credentialId),
      audit: await ctx.db.query('auditEvents').collect(),
    }))
    expect(credential).toMatchObject({ status: 'revoked' })
    expect(credential?.revokedAt).toEqual(expect.any(Number))
    expect(audit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: { kind: 'user', userId: adminUserId },
        action: 'agentCredentials.revoke',
        resourceType: 'agentCredential',
        resourceId: credentialId,
      }),
    )
  })

  it('does not let another organization admin revoke a service actor credential', async () => {
    const t = convexTest(schema, modules)
    const { credentialId } = await seedActor(t, 'member')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    await seedHumanMember(t, otherOrganizationId, 'other-admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'other-admin' }).mutation(api.agentCredentials.revoke, {
        credentialId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const credential = await t.run(async (ctx) => await ctx.db.get(credentialId))
    expect(credential).toMatchObject({ status: 'active' })
  })

  it('rate limits repeated credential revocation per organization admin', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'member')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    const credentialIds = await t.run(async (ctx) => {
      const ids: Id<'agentCredentials'>[] = []
      for (let index = 0; index < 11; index += 1) {
        const serviceActorId = await ctx.db.insert('serviceActors', {
          organizationId,
          name: `Revocable ${index}`,
          role: 'member',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        ids.push(
          await ctx.db.insert('agentCredentials', {
            organizationId,
            serviceActorId,
            secretHash: index.toString(16).repeat(64),
            status: 'active',
            createdAt: Date.now(),
          }),
        )
      }
      return ids
    })

    for (const credentialId of credentialIds.slice(0, 10)) {
      await t.withIdentity({ subject: 'admin' }).mutation(api.agentCredentials.revoke, {
        credentialId,
      })
    }

    let error: unknown
    try {
      await t.withIdentity({ subject: 'admin' }).mutation(api.agentCredentials.revoke, {
        credentialId: credentialIds[10]!,
      })
    } catch (caught) {
      error = caught
    }

    expect(readRateLimitError(error)).toMatchObject({
      kind: 'RateLimited',
      name: 'humanCredentialRevoke',
    })
  })

  it('revoked credential fails', async () => {
    const t = convexTest(schema, modules)
    await seedActor(t, 'member')
    await t.run(async (ctx) => {
      const credential = await ctx.db
        .query('agentCredentials')
        .withIndex('by_secret_hash', (q) => q.eq('secretHash', serviceBearerHash))
        .unique()
      await ctx.db.patch(credential!._id, { status: 'revoked', revokedAt: Date.now() })
    })

    await expect(
      t.query(api.projects.listForServiceActor, {
        serverSecret: process.env.MCP_SERVER_SECRET!,
        bearerToken: 'test-token',
      }),
    ).rejects.toThrow('Service actor credential denied')
  })
})
