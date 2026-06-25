import type { UserIdentity } from 'convex/server'

import { components } from './_generated/api'
import { createAuth } from './auth'
import { initConvexTest } from './test.setup'

export const now = 1_700_000_000_000
export const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

type Role = 'owner' | 'admin' | 'member' | 'viewer'

export function readRateLimitError(error: unknown) {
  if (!error || typeof error !== 'object' || !('data' in error)) {
    return null
  }

  let data = error.data
  while (typeof data === 'string') {
    data = JSON.parse(data)
  }

  if (!data || typeof data !== 'object' || !('kind' in data) || data.kind !== 'RateLimited') {
    return null
  }

  return data
}

export async function seedBetterAuthOrganization(
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

export async function seedBetterAuthActor(
  t: ReturnType<typeof initConvexTest>,
  args: {
    label: string
    organizationId: string
    role: Role
    teamIds?: string[]
  },
) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    const signedUp = await auth.api.signUpEmail({
      body: {
        email: `${args.label}@example.com`,
        password: 'password123',
        name: args.label,
      },
    })
    if (!signedUp.token) {
      throw new Error('Better Auth signup did not return a session token')
    }

    const session = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'session',
      where: [{ field: 'token', value: signedUp.token }],
    })) as { _id: string } | null
    if (!session) {
      throw new Error('Better Auth session row was not created')
    }

    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'member',
        data: {
          organizationId: args.organizationId,
          userId: signedUp.user.id,
          role: args.role,
          createdAt: now,
        },
      },
    })

    for (const teamId of args.teamIds ?? []) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'teamMember',
          data: {
            teamId,
            userId: signedUp.user.id,
            createdAt: now,
          },
        },
      })
    }

    return {
      authUserId: signedUp.user.id,
      sessionId: session._id,
    }
  })
}

export async function signUpBetterAuthUser(
  t: ReturnType<typeof initConvexTest>,
  args: {
    label: string
  },
) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    const signedUp = await auth.api.signUpEmail({
      body: {
        email: `${args.label}@example.com`,
        password: 'password123',
        name: args.label,
      },
    })
    if (!signedUp.token) {
      throw new Error('Better Auth signup did not return a session token')
    }

    const session = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'session',
      where: [{ field: 'token', value: signedUp.token }],
    })) as { _id: string } | null
    if (!session) {
      throw new Error('Better Auth session row was not created')
    }

    return {
      authUserId: signedUp.user.id,
      sessionId: session._id,
      token: signedUp.token,
    }
  })
}

export async function seedBetterAuthTeam(
  t: ReturnType<typeof initConvexTest>,
  args: {
    organizationId: string
    teamId: string
    name?: string
  },
) {
  return await t.run(async (ctx) => {
    const team = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'team',
        data: {
          name: args.name ?? args.teamId,
          organizationId: args.organizationId,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as { _id: string }

    return team._id
  })
}

export async function verifyBetterAuthUserEmail(
  t: ReturnType<typeof initConvexTest>,
  args: {
    userId: string
  },
) {
  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: 'user',
        where: [{ field: '_id', value: args.userId }],
        update: {
          emailVerified: true,
        },
      },
    })
  })
}

export function asActor(
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
