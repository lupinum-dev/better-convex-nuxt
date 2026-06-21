import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

async function seedUser(t: ReturnType<typeof convexTest>, subject: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      subject,
      name: subject,
      email: `${subject}@example.com`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
  })
}

async function seedOrganization(
  t: ReturnType<typeof convexTest>,
  userId: Id<'users'>,
  kind: 'agency' | 'client',
  name: string
) {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name,
      kind,
      createdBy: userId,
      createdAt: Date.now()
    })
    await ctx.db.insert('memberships', {
      organizationId,
      userId,
      role: 'owner',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    return organizationId
  })
}

async function linkClient(
  t: ReturnType<typeof convexTest>,
  agencyOrganizationId: Id<'organizations'>,
  clientOrganizationId: Id<'organizations'>
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('organizationLinks', {
      agencyOrganizationId,
      clientOrganizationId,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
  })
}

describe('agency starter invariants', () => {
  it('agency member can list linked client workspaces only', async () => {
    const t = convexTest(schema, modules)
    const agencyUserId = await seedUser(t, 'agency')
    const clientUserId = await seedUser(t, 'client')
    const agencyOrganizationId = await seedOrganization(t, agencyUserId, 'agency', 'Agency')
    const linkedClientId = await seedOrganization(t, clientUserId, 'client', 'Linked')
    await seedOrganization(t, clientUserId, 'client', 'Unlinked')
    await linkClient(t, agencyOrganizationId, linkedClientId)

    const clients = await t.withIdentity({ subject: 'agency' }).query(api.organizationLinks.listClients, {
      agencyOrganizationId
    })

    expect(clients.map((client: { name: string }) => client.name)).toEqual(['Linked'])
  })

  it('agency member cannot access unlinked clients', async () => {
    const t = convexTest(schema, modules)
    const agencyUserId = await seedUser(t, 'agency')
    const clientUserId = await seedUser(t, 'client')
    const agencyOrganizationId = await seedOrganization(t, agencyUserId, 'agency', 'Agency')
    const clientOrganizationId = await seedOrganization(t, clientUserId, 'client', 'Client')

    await expect(
      t.withIdentity({ subject: 'agency' }).mutation(api.clientProjects.createForClient, {
        agencyOrganizationId,
        clientOrganizationId,
        name: 'Blocked'
      })
    ).rejects.toThrow('Client access denied')
  })

  it('client member cannot access sibling clients', async () => {
    const t = convexTest(schema, modules)
    const clientUserId = await seedUser(t, 'client')
    await seedOrganization(t, clientUserId, 'client', 'Own')
    const siblingClientId = await t.run(async (ctx) => {
      const otherUserId = await ctx.db.insert('users', {
        subject: 'other',
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      return await ctx.db.insert('organizations', {
        name: 'Sibling',
        kind: 'client',
        createdBy: otherUserId,
        createdAt: Date.now()
      })
    })

    await expect(
      t.withIdentity({ subject: 'client' }).query(api.clientProjects.listForClient, {
        clientOrganizationId: siblingClientId
      })
    ).rejects.toThrow('Organization access denied')
  })

  it('revoked link removes delegated access', async () => {
    const t = convexTest(schema, modules)
    const agencyUserId = await seedUser(t, 'agency')
    const clientUserId = await seedUser(t, 'client')
    const agencyOrganizationId = await seedOrganization(t, agencyUserId, 'agency', 'Agency')
    const clientOrganizationId = await seedOrganization(t, clientUserId, 'client', 'Client')
    await linkClient(t, agencyOrganizationId, clientOrganizationId)

    await t.run(async (ctx) => {
      const link = await ctx.db
        .query('organizationLinks')
        .withIndex('by_agency_client', (q: any) =>
          q
            .eq('agencyOrganizationId', agencyOrganizationId)
            .eq('clientOrganizationId', clientOrganizationId)
        )
        .unique()
      await ctx.db.patch(link!._id, { status: 'revoked' })
    })

    await expect(
      t.withIdentity({ subject: 'agency' }).mutation(api.clientProjects.createForClient, {
        agencyOrganizationId,
        clientOrganizationId,
        name: 'Blocked'
      })
    ).rejects.toThrow('Client access denied')
  })

  it('audit records delegated access path', async () => {
    const t = convexTest(schema, modules)
    const agencyUserId = await seedUser(t, 'agency')
    const clientUserId = await seedUser(t, 'client')
    const agencyOrganizationId = await seedOrganization(t, agencyUserId, 'agency', 'Agency')
    const clientOrganizationId = await seedOrganization(t, clientUserId, 'client', 'Client')
    await linkClient(t, agencyOrganizationId, clientOrganizationId)

    await t.withIdentity({ subject: 'agency' }).mutation(api.clientProjects.createForClient, {
      agencyOrganizationId,
      clientOrganizationId,
      name: 'Audit me'
    })

    const events = await t.run(async (ctx) => {
      return await ctx.db.query('auditEvents').collect()
    })

    expect(events[0]?.accessPath).toBe('delegated')
  })
})
