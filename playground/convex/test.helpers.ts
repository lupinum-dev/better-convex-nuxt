/**
 * Test Helpers
 *
 * DRY setup functions for integration tests with convex-test.
 */

import { convexTest } from 'convex-test'

import type { Id } from './_generated/dataModel'
import type { Role } from './permissions.config'

import schema from './schema'
import { modules, fixtures } from './test.setup'

/**
 * Create a test context with an org and single user already set up
 */
export async function setupTestWithUser(role: Role = 'member') {
  const t = convexTest(schema, modules)

  // Create org
  const orgId = await t.run(async (ctx) => {
    return await ctx.db.insert('organizations', {
      name: 'Test Org',
      slug: 'test-org',
      ownerId: 'user_owner',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  // Create user
  const authId = `user_${role}_${Date.now()}`

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      authId,
      role,
      organizationId: orgId,
      displayName: `Test ${role}`,
      email: `${role}@test.com`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  // Return authenticated context
  const asUser = t.withIdentity({ subject: authId })

  return { t, orgId, authId, userId, asUser }
}

/**
 * Create a test context with multiple users in same org
 */
export async function setupTestWithMultipleUsers() {
  const t = convexTest(schema, modules)

  // Create org
  const orgId = await t.run(async (ctx) => {
    return await ctx.db.insert('organizations', {
      name: 'Test Org',
      slug: 'test-org',
      ownerId: fixtures.users.owner.authId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  // Create all users
  const userIds: Record<string, Id<'users'>> = {}

  await t.run(async (ctx) => {
    for (const [key, userData] of Object.entries(fixtures.users)) {
      userIds[key] = await ctx.db.insert('users', {
        authId: userData.authId,
        role: userData.role,
        organizationId: orgId,
        displayName: userData.displayName,
        email: userData.email,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
  })

  return {
    t,
    orgId,
    userIds,
    asOwner: t.withIdentity({ subject: fixtures.users.owner.authId }),
    asAdmin: t.withIdentity({ subject: fixtures.users.admin.authId }),
    asMember: t.withIdentity({ subject: fixtures.users.member.authId }),
    asViewer: t.withIdentity({ subject: fixtures.users.viewer.authId }),
  }
}

/**
 * Create a test context with two separate orgs
 */
export async function setupTestWithTwoOrgs() {
  const t = convexTest(schema, modules)

  // Create first org
  const org1Id = await t.run(async (ctx) => {
    return await ctx.db.insert('organizations', {
      name: 'Org 1',
      slug: 'org-1',
      ownerId: 'user_1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  // Create second org
  const org2Id = await t.run(async (ctx) => {
    return await ctx.db.insert('organizations', {
      name: 'Org 2',
      slug: 'org-2',
      ownerId: 'user_2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  // Create users in different orgs
  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      authId: 'user_1',
      role: 'member',
      organizationId: org1Id,
      displayName: 'User 1',
      email: 'user1@test.com',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await ctx.db.insert('users', {
      authId: 'user_2',
      role: 'member',
      organizationId: org2Id,
      displayName: 'User 2',
      email: 'user2@test.com',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  return {
    t,
    org1Id,
    org2Id,
    asUser1: t.withIdentity({ subject: 'user_1' }),
    asUser2: t.withIdentity({ subject: 'user_2' }),
  }
}
