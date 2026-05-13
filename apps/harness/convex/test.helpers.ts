/**
 * Test Helpers
 *
 * DRY setup functions for integration tests with convex-test.
 */

import { createIdentityForwardingEnvelopeArgs } from '@lupinum/trellis/backend'
import { convexTest } from 'convex-test'
import { getFunctionName, type FunctionReference } from 'convex/server'

import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules, fixtures } from './test.setup'

export const INTERNAL_HARNESS_TEST_IDENTITY_FORWARDING_KEY =
  'internal-harness-test-identity-forwarding-key'

export function withTrustedCaller<TArgs extends Record<string, unknown> | undefined>(
  args: TArgs,
  caller: Record<string, unknown>,
  actingFor?: Record<string, unknown> | null,
  functionRef?: FunctionReference<'query' | 'mutation' | 'action', 'public' | 'internal'> | string,
) {
  if (!functionRef) {
    throw new Error('withTrustedCaller requires the exact Convex function ref for signing.')
  }

  const principalSubject =
    typeof caller.subject === 'string' && caller.subject.length > 0
      ? caller.subject
      : typeof caller.userId === 'string' && caller.userId.length > 0
        ? `user:${caller.userId}`
        : typeof caller.agentId === 'string' && caller.agentId.length > 0
          ? `agent:${caller.agentId}`
          : 'agent:identity-forwarding-test'
  return createIdentityForwardingEnvelopeArgs({
    args: args ?? {},
    caller: {
      ...caller,
      subject: principalSubject,
    },
    ...(actingFor ? { actingFor: actingFor as { subject: string } & Record<string, unknown> } : {}),
    functionRef: typeof functionRef === 'string' ? functionRef : getFunctionName(functionRef),
    operation: 'mutation',
    key: INTERNAL_HARNESS_TEST_IDENTITY_FORWARDING_KEY,
  }) as TArgs & { _trellisForwarding: string }
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
