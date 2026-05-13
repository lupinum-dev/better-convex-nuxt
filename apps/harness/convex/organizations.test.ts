import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { INTERNAL_HARNESS_TEST_IDENTITY_FORWARDING_KEY, withTrustedCaller } from './test.helpers'
import { modules } from './test.setup'

describe('organizations', () => {
  process.env.CONVEX_IDENTITY_FORWARDING_KEY = INTERNAL_HARNESS_TEST_IDENTITY_FORWARDING_KEY

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

  it('assigns the forwarded caller user as owner when creating an organization', async () => {
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

    const orgId = await t.mutation(
      api.organizations.create,
      withTrustedCaller(
        {
          name: 'Service Org',
          slug: 'service-org',
        },
        {
          kind: 'user',
          userId: 'service_user',
          subject: 'user:service_user',
        },
        null,
        api.organizations.create,
      ),
    )

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

  it('fails cleanly when the forwarded caller has no backing user row', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.mutation(
        api.organizations.create,
        withTrustedCaller(
          {
            name: 'Missing User Org',
            slug: 'missing-user-org',
          },
          {
            kind: 'user',
            userId: 'missing_user',
            subject: 'user:missing_user',
          },
          null,
          api.organizations.create,
        ),
      ),
    ).rejects.toThrow('Forbidden: Create organization')

    const organizations = await t.query(api.organizations.list, {})
    expect(organizations).toEqual([])
  })
})
