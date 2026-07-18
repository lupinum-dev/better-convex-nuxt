/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { componentsGeneric, defineSchema } from 'convex/server'
import { describe, expect, it } from 'vitest'

import type { ComponentApi } from '../../src/runtime/convex-auth/component/_generated/component'
import teamAuthSchema from '../../starters/team/convex/betterAuth/schema'

const rootModules = import.meta.glob('../fixtures/jwks-rotation/convex/**/*.ts')
const authModules = import.meta.glob('../../starters/team/convex/betterAuth/**/*.ts')
const rootSchema = defineSchema({})
const components = componentsGeneric() as unknown as {
  compoundUniqueAuth: ComponentApi<'compoundUniqueAuth'>
}
const auth = components.compoundUniqueAuth.adapter
const now = 1_700_000_000_000

function initCompoundUniqueTest() {
  const test = convexTest(rootSchema, rootModules)
  test.registerComponent('compoundUniqueAuth', teamAuthSchema, authModules)
  return test
}

async function createAuthRow(
  test: ReturnType<typeof initCompoundUniqueTest>,
  model: string,
  data: Record<string, unknown>,
) {
  return await test.mutation(auth.create, { model, data })
}

describe('Better Auth adapter compound uniqueness', () => {
  it('rejects duplicate account, organization-member, and team-member identities', async () => {
    const test = initCompoundUniqueTest()

    await createAuthRow(test, 'account', {
      id: 'account_one',
      accountId: 'subject_one',
      providerId: 'provider_one',
      userId: 'user_one',
      createdAt: now,
      updatedAt: now,
    })
    await createAuthRow(test, 'account', {
      id: 'account_same_provider_user',
      accountId: 'subject_two',
      providerId: 'provider_one',
      userId: 'user_one',
      createdAt: now,
      updatedAt: now,
    })
    await expect(
      createAuthRow(test, 'account', {
        id: 'account_two',
        accountId: 'subject_one',
        providerId: 'provider_one',
        userId: 'user_two',
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow('AUTH_UNIQUE_CONFLICT:account.accountId_providerId')

    await createAuthRow(test, 'member', {
      id: 'member_one',
      organizationId: 'organization_one',
      userId: 'user_one',
      role: 'owner',
      createdAt: now,
    })
    await expect(
      createAuthRow(test, 'member', {
        id: 'member_two',
        organizationId: 'organization_one',
        userId: 'user_one',
        role: 'member',
        createdAt: now,
      }),
    ).rejects.toThrow('AUTH_UNIQUE_CONFLICT:member.organizationId_userId')

    await createAuthRow(test, 'teamMember', {
      id: 'team_member_one',
      teamId: 'team_one',
      userId: 'user_one',
    })
    await expect(
      createAuthRow(test, 'teamMember', {
        id: 'team_member_two',
        teamId: 'team_one',
        userId: 'user_one',
      }),
    ).rejects.toThrow('AUTH_UNIQUE_CONFLICT:teamMember.teamId_userId')
  })

  it('allows multiple null values for nullable unique fields', async () => {
    const test = initCompoundUniqueTest()

    await createAuthRow(test, 'teamMember', {
      id: 'team_member_null_one',
      teamId: 'team_one',
      userId: 'user_one',
      membershipKey: null,
    })
    await createAuthRow(test, 'teamMember', {
      id: 'team_member_null_two',
      teamId: 'team_two',
      userId: 'user_two',
      membershipKey: null,
    })
  })

  it('checks merged update candidates and rolls back conflicting bulk updates', async () => {
    const test = initCompoundUniqueTest()

    await createAuthRow(test, 'member', {
      id: 'member_update_one',
      organizationId: 'organization_one',
      userId: 'user_shared',
      role: 'owner',
      createdAt: now,
    })
    await createAuthRow(test, 'member', {
      id: 'member_update_two',
      organizationId: 'organization_two',
      userId: 'user_shared',
      role: 'member',
      createdAt: now,
    })

    await expect(
      test.mutation(auth.updateOne, {
        model: 'member',
        where: [{ field: 'id', value: 'member_update_two' }],
        update: { organizationId: 'organization_one' },
      }),
    ).rejects.toThrow('AUTH_UNIQUE_CONFLICT:member.organizationId_userId')

    await expect(
      test.mutation(auth.incrementOne, {
        model: 'member',
        where: [{ field: 'id', value: 'member_update_two' }],
        increment: {},
        set: { organizationId: 'organization_one' },
      }),
    ).rejects.toThrow('AUTH_UNIQUE_CONFLICT:member.organizationId_userId')

    await expect(
      test.mutation(auth.updateMany, {
        model: 'member',
        where: [{ field: 'userId', value: 'user_shared' }],
        update: { organizationId: 'organization_three' },
      }),
    ).rejects.toThrow('AUTH_UNIQUE_CONFLICT:member.organizationId_userId')

    const [first, second] = await Promise.all([
      test.query(auth.findOne, {
        model: 'member',
        where: [{ field: 'id', value: 'member_update_one' }],
      }),
      test.query(auth.findOne, {
        model: 'member',
        where: [{ field: 'id', value: 'member_update_two' }],
      }),
    ])

    expect(first).toMatchObject({ organizationId: 'organization_one' })
    expect(second).toMatchObject({ organizationId: 'organization_two' })
  })
})
