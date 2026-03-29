import { convexTest } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('organizations', () => {
  beforeEach(() => {
    process.env.CONVEX_SERVICE_KEY = 'test-service-key'
  })

  it('assigns the current browser-auth user as owner when creating an organization', async () => {
    const t = convexTest(schema, modules)

    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        authId: 'browser_user',
        role: 'member',
        displayName: 'Browser User',
        email: 'browser@test.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const asBrowserUser = t.withIdentity({ subject: 'browser_user' })
    const orgId = await asBrowserUser.mutation(api.organizations.create, {
      name: 'Browser Org',
      slug: 'browser-org',
    })

    const user = await t.run(async (ctx) => {
      return await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q) => q.eq('authId', 'browser_user'))
        .first()
    })

    expect(user).toMatchObject({
      organizationId: orgId,
      role: 'owner',
    })
  })

  it('assigns the service-auth user as owner when creating an organization', async () => {
    const t = convexTest(schema, modules)

    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        authId: 'service_user',
        role: 'member',
        displayName: 'Service User',
        email: 'service@test.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const orgId = await t.mutation(api.organizations.create, {
      name: 'Service Org',
      slug: 'service-org',
      _serviceKey: 'test-service-key',
      _serviceActor: {
        userId: 'service_user',
        role: 'member',
      },
    })

    const user = await t.run(async (ctx) => {
      return await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q) => q.eq('authId', 'service_user'))
        .first()
    })

    expect(user).toMatchObject({
      organizationId: orgId,
      role: 'owner',
    })
  })

  it('fails cleanly when the service-auth caller has no backing user row', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.mutation(api.organizations.create, {
        name: 'Missing User Org',
        slug: 'missing-user-org',
        _serviceKey: 'test-service-key',
        _serviceActor: {
          userId: 'missing_user',
          role: 'member',
        },
      }),
    ).rejects.toThrow('User not found')

    const organizations = await t.query(api.organizations.list, {})
    expect(organizations).toEqual([])
  })
})
