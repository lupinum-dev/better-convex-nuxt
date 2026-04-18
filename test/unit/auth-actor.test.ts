import { describe, expect, expectTypeOf, it } from 'vitest'

import { defineActor, type DefaultActor } from '../../src/runtime/auth'

type FakeUser = {
  _id: string
  authId: string
  role: string
  workspaceId?: string
  plan?: string
}

type FakeMembership = {
  _id: string
  userId: string
  workspaceId: string
  role: string
}

type ActorCtx = Parameters<ReturnType<typeof defineActor.fromAuth>['resolve']>[0]

function createCtx(options: {
  identity: { subject: string } | null
  users?: FakeUser[]
  memberships?: FakeMembership[]
}): ActorCtx {
  const users = options.users ?? []
  const memberships = options.memberships ?? []

  return {
    auth: {
      getUserIdentity: async () => options.identity,
    },
    db: {
      query(table: string) {
        return {
          withIndex(
            index: string,
            apply: (query: { eq: (field: string, value: unknown) => unknown }) => unknown,
          ) {
            const terms = new Map<string, unknown>()
            const query = {
              eq(field: string, value: unknown) {
                terms.set(field, value)
                return query
              },
            }

            apply(query)

            return {
              first: async () => {
                if (table === 'users' && index === 'by_auth_id') {
                  return users.find((user) => user.authId === terms.get('authId')) ?? null
                }

                if (table === 'memberships' && index === 'by_user') {
                  return (
                    memberships.find((membership) => membership.userId === terms.get('userId')) ??
                    null
                  )
                }

                return null
              },
            }
          },
        }
      },
    },
  } as unknown as ActorCtx
}

describe('defineActor', () => {
  it('builds auth-backed actors through composable extension and filter layers', async () => {
    const actor = defineActor
      .fromAuth()
      .extend({
        fields: async (_ctx, user, baseActor) => ({
          plan: user.plan ?? 'free',
          summary: `${baseActor.role}:${String(user.authId)}`,
        }),
      })
      .filter(
        (value): value is DefaultActor & { tenantId: string; plan: string; summary: string } =>
          typeof value.tenantId === 'string',
      )

    expectTypeOf(actor.type).toEqualTypeOf<
      DefaultActor & { tenantId: string; plan: string; summary: string }
    >()

    await expect(
      actor.resolve(
        createCtx({
          identity: { subject: 'alice' },
          users: [
            {
              _id: 'user-1',
              authId: 'alice',
              role: 'admin',
              workspaceId: 'workspace-1',
              plan: 'pro',
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      kind: 'user',
      userId: 'alice',
      role: 'admin',
      tenantId: 'workspace-1',
      plan: 'pro',
      summary: 'admin:alice',
    })
  })

  it('throws a setup error when auth resolves but the Trellis user row is missing', async () => {
    await expect(
      defineActor.fromAuth().resolve(
        createCtx({
          identity: { subject: 'missing' },
          users: [{ _id: 'user-1', authId: 'alice', role: 'member', workspaceId: 'workspace-1' }],
        }),
      ),
    ).rejects.toThrow(/Expected a Trellis users row for auth subject \\"missing\\"/)

    await expect(
      defineActor
        .fromMembership({
          membershipTable: 'memberships',
          roleField: 'role',
        })
        .resolve(
          createCtx({
            identity: { subject: 'missing' },
            users: [
              { _id: 'user-1', authId: 'alice', role: 'member', workspaceId: 'workspace-1' },
            ],
          }),
        ),
    ).rejects.toThrow(/Expected a Trellis users row for auth subject \\"missing\\"/)
  })

  it('returns null when the auth user is filtered out after resolution', async () => {
    const requiresTenant = defineActor
      .fromAuth()
      .filter(
        (actor): actor is DefaultActor & { tenantId: string } => typeof actor.tenantId === 'string',
      )

    await expect(
      requiresTenant.resolve(
        createCtx({
          identity: { subject: 'alice' },
          users: [{ _id: 'user-1', authId: 'alice', role: 'member' }],
        }),
      ),
    ).resolves.toBeNull()
  })

  it('resolves a composed actor directly from the builder chain', async () => {
    const getActor = defineActor.fromAuth().extend({
      fields: async (_ctx, user) => ({
        plan: user.plan ?? 'free',
      }),
    }).resolve

    await expect(
      getActor(
        createCtx({
          identity: { subject: 'alice' },
          users: [
            {
              _id: 'user-1',
              authId: 'alice',
              role: 'owner',
              workspaceId: 'workspace-1',
              plan: 'enterprise',
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      kind: 'user',
      userId: 'alice',
      role: 'owner',
      tenantId: 'workspace-1',
      plan: 'enterprise',
    })
  })

  it('supports membership-backed role resolution through the builder', async () => {
    const actor = defineActor.fromMembership({
      membershipTable: 'memberships',
      roleField: 'role',
    })

    const ctx = createCtx({
      identity: { subject: 'alice' },
      users: [{ _id: 'user-1', authId: 'alice', role: 'viewer' }],
      memberships: [
        {
          _id: 'membership-1',
          userId: 'user-1',
          workspaceId: 'workspace-2',
          role: 'admin',
        },
      ],
    })

    await expect(actor.resolve(ctx)).resolves.toEqual({
      kind: 'user',
      userId: 'alice',
      role: 'admin',
      tenantId: 'workspace-2',
    })
  })
})
