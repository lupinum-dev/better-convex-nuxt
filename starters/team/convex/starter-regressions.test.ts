import type { UserIdentity } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { normalizeLocalCallbackURL } from '../shared/inputSchemas'
import { api, components, internal } from './_generated/api'
import { escapeEmailHtml, sendStarterEmail } from './lib/authEmail'
import { requireBoundedPageSize } from './lib/pagination'
import { initConvexTest } from './test.setup'
import { signUpBetterAuthUser } from './testHelpers'

const now = 1_700_000_000_000

describe('team pagination bounds', () => {
  it.each([0, -1, 1.5, 51, Number.NaN])('rejects invalid page size %s', (numItems) => {
    expect(() => requireBoundedPageSize(numItems)).toThrow(
      'Page size must be an integer from 1 to 50',
    )
  })

  it.each([1, 25, 50])('accepts bounded page size %s', (numItems) => {
    expect(() => requireBoundedPageSize(numItems)).not.toThrow()
  })
})

type Role = 'owner' | 'admin' | 'member' | 'viewer'

async function seedBetterAuthOrganization(
  t: ReturnType<typeof initConvexTest>,
  args: {
    name: string
  },
) {
  return await t.run(async (ctx) => {
    const organization = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'organization',
        data: {
          name: args.name,
          slug: args.name,
          createdAt: now,
        },
      },
    })) as { _id: string }

    return organization._id
  })
}

async function seedBetterAuthTeam(
  t: ReturnType<typeof initConvexTest>,
  args: {
    organizationId: string
    name: string
  },
) {
  return await t.run(async (ctx) => {
    const team = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'team',
        data: {
          name: args.name,
          organizationId: args.organizationId,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as { _id: string }

    return team._id
  })
}

async function seedBetterAuthMember(
  t: ReturnType<typeof initConvexTest>,
  args: {
    organizationId: string
    userId: string
    role: Role
  },
) {
  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'member',
        data: {
          organizationId: args.organizationId,
          userId: args.userId,
          role: args.role,
          createdAt: now,
        },
      },
    })
  })
}

async function seedBetterAuthUserRow(
  t: ReturnType<typeof initConvexTest>,
  args: {
    label: string
  },
) {
  return await t.run(async (ctx) => {
    const user = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'user',
        data: {
          name: args.label,
          email: `${args.label}@example.com`,
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as { _id?: string; id?: string }

    const userId = user.id ?? user._id
    if (!userId) {
      throw new Error('Better Auth user row missing id')
    }

    return userId
  })
}

function asActor(
  t: ReturnType<typeof initConvexTest>,
  args: {
    userId: string
    sessionId: string
  },
) {
  return t.withIdentity({
    subject: args.userId,
    sessionId: args.sessionId,
  } as Partial<UserIdentity>)
}

describe('team starter regressions', () => {
  it('escapes user-controlled transactional-email HTML', () => {
    expect(escapeEmailHtml(`<img src=x onerror="alert('x')"> & invited`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; invited',
    )
  })

  it('never permits production credential-link logging through the test reset flag', async () => {
    const previousResetFlag = process.env.ALLOW_TEST_RESET
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    process.env.ALLOW_TEST_RESET = 'true'
    try {
      for (const siteUrl of [
        'https://app.example.test',
        'http://localhost.evil',
        'http://127.0.0.1.evil',
        'http://localhost:3000@evil.example',
        'http://127.0.0.1@evil.example',
        'not-a-url',
      ]) {
        await expect(
          sendStarterEmail({
            recipient: 'recipient@example.test',
            siteUrl,
            fallbackLabel: 'Verification link',
            fallbackUrl: `${siteUrl}/verify?token=credential-sentinel`,
            content: {
              subject: 'Verify',
              text: 'Verify',
              html: '<p>Verify</p>',
            },
          }),
        ).rejects.toThrow('Verification link delivery is not configured')
      }
      expect(consoleInfo).not.toHaveBeenCalled()
    } finally {
      consoleInfo.mockRestore()
      if (previousResetFlag === undefined) delete process.env.ALLOW_TEST_RESET
      else process.env.ALLOW_TEST_RESET = previousResetFlag
    }
  })

  it('normalizes auth callback URLs to one local path', () => {
    expect(normalizeLocalCallbackURL('/invitations/invite_1?source=email#accept')).toBe(
      '/invitations/invite_1?source=email#accept',
    )

    for (const hostile of [
      '//evil.example/path',
      '///evil.example/path',
      '/\\evil.example/path',
      '/safe\\evil.example/path',
      '/%2e%2e//evil.example/path',
      '/.%2e//evil.example/path',
      '/safe/..//evil.example/path',
      'https://evil.example/path',
      '',
      `/\u0000//evil.example/path`,
    ]) {
      expect(normalizeLocalCallbackURL(hostile)).toBe('/')
    }
  })

  it('clears nullable projection fields and deletes the projection row', async () => {
    const t = initConvexTest()
    const originalUser = {
      _id: 'auth_projection_1',
      name: 'Ada',
      email: 'ada@example.com',
      image: 'https://example.com/ada.png',
    }

    await t.mutation(internal.auth.onCreate, {
      model: 'user',
      doc: originalUser,
    })

    await t.mutation(internal.auth.onUpdate, {
      model: 'user',
      oldDoc: originalUser,
      newDoc: {
        ...originalUser,
        image: null,
      },
    })

    const projectedAfterUpdate = await t.run(async (ctx) => {
      return await ctx.db
        .query('users')
        .withIndex('by_auth_user_id', (q) => q.eq('authUserId', originalUser._id))
        .unique()
    })

    expect(projectedAfterUpdate).toMatchObject({
      authUserId: originalUser._id,
      name: 'Ada',
      email: 'ada@example.com',
    })
    expect(projectedAfterUpdate?.image).toBeUndefined()

    await t.mutation(internal.auth.onDelete, {
      model: 'user',
      doc: {
        ...originalUser,
        image: null,
      },
    })

    const projectedAfterDelete = await t.run(async (ctx) => {
      return await ctx.db
        .query('users')
        .withIndex('by_auth_user_id', (q) => q.eq('authUserId', originalUser._id))
        .unique()
    })

    expect(projectedAfterDelete).toBeNull()
  })

  it('paginates every organization member and selected-team membership after 100 rows', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, {
      name: 'org_member_pagination',
    })
    const teamId = await seedBetterAuthTeam(t, {
      organizationId,
      name: 'Paginated Team',
    })
    const ownerSeed = await signUpBetterAuthUser(t, {
      label: 'organization_member_list_owner',
    })
    await seedBetterAuthMember(t, {
      organizationId,
      userId: ownerSeed.authUserId,
      role: 'owner',
    })

    const seededUserIds: string[] = []
    for (let index = 0; index < 105; index += 1) {
      const label = `organization_member_${index}`
      const userId = await seedBetterAuthUserRow(t, { label })
      seededUserIds.push(userId)
      await seedBetterAuthMember(t, {
        organizationId,
        userId,
        role: 'member',
      })
    }
    await t.run(async (ctx) => {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'teamMember',
          data: {
            teamId,
            userId: seededUserIds[104]!,
            createdAt: now,
          },
        },
      })
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    const firstPage = await owner.query(api.organizations.listMembers, {
      organizationId,
      teamId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    const secondPage = await owner.query(api.organizations.listMembers, {
      organizationId,
      teamId,
      paginationOpts: { cursor: firstPage.continueCursor, numItems: 50 },
    })
    const thirdPage = await owner.query(api.organizations.listMembers, {
      organizationId,
      teamId,
      paginationOpts: { cursor: secondPage.continueCursor, numItems: 50 },
    })
    const members = [...firstPage.page, ...secondPage.page, ...thirdPage.page]

    expect(members).toHaveLength(106)
    expect(firstPage.isDone).toBe(false)
    expect(secondPage.isDone).toBe(false)
    expect(thirdPage.isDone).toBe(true)
    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: ownerSeed.authUserId,
          role: 'owner',
        }),
        expect.objectContaining({
          userId: seededUserIds[0],
          role: 'member',
          user: expect.objectContaining({
            email: 'organization_member_0@example.com',
          }),
        }),
        expect.objectContaining({
          userId: seededUserIds[104],
          role: 'member',
          isTeamMember: true,
          user: expect.objectContaining({
            email: 'organization_member_104@example.com',
          }),
        }),
      ]),
    )
  })
})
