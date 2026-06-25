import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { convexTest, seedActor, seedHumanMember, setMcpServerSecret } from '../test/mcpTestHelpers'
import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('mcp-agent organization access invariants', () => {
  let restoreMcpServerSecret: () => void

  beforeEach(() => {
    restoreMcpServerSecret = setMcpServerSecret()
  })

  afterEach(() => {
    restoreMcpServerSecret()
  })

  it('requires organization membership for organization reads', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'removed', 'member', 'removed')
    await seedHumanMember(t, organizationId, 'outsider', 'member')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })

    await expect(
      t.withIdentity({ subject: 'removed' }).query(api.organizations.get, {
        organizationId,
      }),
    ).rejects.toThrow('Insufficient organization role')
    await expect(
      t.withIdentity({ subject: 'outsider' }).query(api.organizations.get, {
        organizationId: otherOrganizationId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const organization = await t.withIdentity({ subject: 'member' }).query(api.organizations.get, {
      organizationId,
    })
    expect(organization).toMatchObject({ name: 'Acme' })
  })

  it('requires organization admin for membership listing', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'member' }).query(api.memberships.listForOrganization, {
        organizationId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const memberships = await t
      .withIdentity({ subject: 'admin' })
      .query(api.memberships.listForOrganization, {
        organizationId,
      })
    expect(memberships).toHaveLength(2)
  })

  it('lists only active organizations for the current user', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        subject: 'member',
        name: 'member',
        email: 'member@example.com',
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
      await ctx.db.insert('memberships', {
        organizationId: otherOrganizationId,
        userId,
        role: 'member',
        status: 'removed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const organizations = await t
      .withIdentity({ subject: 'member' })
      .query(api.organizations.listMine, {})

    expect(organizations).toEqual([
      expect.objectContaining({
        id: organizationId,
        name: 'Acme',
        role: 'member',
      }),
    ])
  })
})
