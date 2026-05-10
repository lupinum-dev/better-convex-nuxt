import { describe, expect, expectTypeOf, it } from 'vitest'

import { defineActor, type DefaultActor } from '../../src/runtime/auth'
import { setTrustedForwardingContext } from '../../src/runtime/trusted-forwarding'
import { createTrustedForwardingEnvelopeArgs } from '../../src/runtime/trusted-forwarding/shared'

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

function signedForwardingArgs(options: {
  principal: { subject: string } & Record<string, unknown>
  delegation?: { subject: string } & Record<string, unknown>
}) {
  return createTrustedForwardingEnvelopeArgs({
    args: {},
    principal: options.principal,
    ...(options.delegation ? { delegation: options.delegation } : {}),
    functionRef: 'tests.authActor.resolve',
    operation: 'query',
    key: 'trusted-key',
  })
}

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
            users: [{ _id: 'user-1', authId: 'alice', role: 'member', workspaceId: 'workspace-1' }],
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

  it('resolves the actor from trusted-forwarding identity when browser auth is absent', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'

    const ctx = createCtx({
      identity: null,
      users: [{ _id: 'user-1', authId: 'trusted_user', role: 'admin', workspaceId: 'workspace-1' }],
    })

    setTrustedForwardingContext(
      ctx as unknown as Record<string, unknown>,
      signedForwardingArgs({
        principal: {
          kind: 'user',
          userId: 'trusted_user',
          subject: 'user:trusted_user',
        },
      }),
    )

    await expect(defineActor.fromAuth().resolve(ctx)).resolves.toEqual({
      kind: 'user',
      userId: 'trusted_user',
      role: 'admin',
      tenantId: 'workspace-1',
    })
  })

  it('falls back to browser auth when the forwarded principal is not a canonical user subject', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'

    const ctx = createCtx({
      identity: { subject: 'browser_user' },
      users: [
        { _id: 'user-1', authId: 'browser_user', role: 'member', workspaceId: 'workspace-1' },
      ],
    })

    setTrustedForwardingContext(
      ctx as unknown as Record<string, unknown>,
      signedForwardingArgs({
        principal: {
          kind: 'agent',
          agentId: 'assistant-bot',
          subject: 'agent:assistant-bot',
        },
      }),
    )

    await expect(defineActor.fromAuth().resolve(ctx)).resolves.toEqual({
      kind: 'user',
      userId: 'browser_user',
      role: 'member',
      tenantId: 'workspace-1',
    })
  })

  it('prefers a delegated canonical user subject over a non-user principal', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'

    const ctx = createCtx({
      identity: null,
      users: [
        {
          _id: 'user-1',
          authId: 'delegated_user',
          role: 'owner',
          workspaceId: 'workspace-1',
        },
      ],
    })

    setTrustedForwardingContext(
      ctx as unknown as Record<string, unknown>,
      signedForwardingArgs({
        principal: {
          kind: 'agent',
          agentId: 'assistant-bot',
          subject: 'agent:assistant-bot',
        },
        delegation: {
          subject: 'user:delegated_user',
        },
      }),
    )

    await expect(defineActor.fromAuth().resolve(ctx)).resolves.toEqual({
      kind: 'user',
      userId: 'delegated_user',
      role: 'owner',
      tenantId: 'workspace-1',
    })
  })

  it('does not resolve an actor from a non-user signed principal without delegation', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'

    const ctx = createCtx({
      identity: null,
      users: [{ _id: 'user-1', authId: 'trusted_user', role: 'admin', workspaceId: 'workspace-1' }],
    })

    setTrustedForwardingContext(
      ctx as unknown as Record<string, unknown>,
      signedForwardingArgs({
        principal: {
          kind: 'agent',
          agentId: 'assistant-bot',
          subject: 'agent:assistant-bot',
        },
      }),
    )

    await expect(defineActor.fromAuth().resolve(ctx)).resolves.toBeNull()
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
