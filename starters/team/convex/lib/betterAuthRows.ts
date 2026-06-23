import { components } from '../_generated/api'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type Ctx = QueryCtx | MutationCtx
type BetterAuthFindOneArgs = (typeof components.betterAuth.adapter.findOne)['_args']
type BetterAuthModel = BetterAuthFindOneArgs['model']
type BetterAuthFindManyResult<T extends Record<string, unknown>> = T[] | BetterAuthPageResult<T>
type BetterAuthFindManyArgs = (typeof components.betterAuth.adapter.findMany)['_args']
type BetterAuthFindManyWhere = NonNullable<BetterAuthFindManyArgs['where']>[number]
type BetterAuthSortBy = BetterAuthFindManyArgs['sortBy']
type BetterAuthPageResult<T extends Record<string, unknown>> = {
  page: T[]
  isDone: boolean
  continueCursor: string | null
}
type BetterAuthRowWithId = {
  _id?: string
  id?: string
}

export type BetterAuthMember = BetterAuthRowWithId & {
  organizationId: string
  userId: string
  role: string
}

export type BetterAuthTeam = BetterAuthRowWithId & {
  organizationId: string
  name?: string
}

export type BetterAuthTeamMember = BetterAuthRowWithId & {
  teamId: string
  userId: string
}

export type BetterAuthUser = BetterAuthRowWithId & {
  email: string
  name: string
  image?: string | null
}

export type BetterAuthOrganizationMember = {
  id: string
  organizationId: string
  userId: string
  role: string
  user?: {
    id: string
    email: string
    name: string
    image?: string
  }
}

const betterAuthPageSize = 100

async function findBetterAuthRow<T extends Record<string, unknown>>(
  ctx: Ctx,
  model: BetterAuthModel,
  where: { field: string; value: string }[],
) {
  return (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model,
    where,
  })) as T | null
}

function getBetterAuthRowId(row: BetterAuthRowWithId, label: string) {
  const id = row.id ?? row._id
  if (!id) {
    throw new Error(`Better Auth ${label} row missing id`)
  }

  return id
}

async function listBetterAuthRows<T extends Record<string, unknown>>(
  ctx: Ctx,
  args: {
    model: BetterAuthModel
    where?: BetterAuthFindManyWhere[]
    sortBy?: BetterAuthSortBy
  },
) {
  const rows: T[] = []
  let cursor: string | null = null

  while (true) {
    const result = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: args.model,
      where: args.where,
      sortBy: args.sortBy,
      paginationOpts: {
        cursor,
        numItems: betterAuthPageSize,
      },
    })) as BetterAuthFindManyResult<T>

    const page = Array.isArray(result) ? result : result.page
    rows.push(...page)

    if (Array.isArray(result) || result.isDone) {
      return rows
    }

    cursor = result.continueCursor
  }
}

export async function getBetterAuthMember(
  ctx: Ctx,
  args: {
    organizationId: string
    userId: string
  },
) {
  return await findBetterAuthRow<BetterAuthMember>(ctx, 'member', [
    { field: 'organizationId', value: args.organizationId },
    { field: 'userId', value: args.userId },
  ])
}

export async function getBetterAuthTeam(
  ctx: Ctx,
  args: {
    teamId: string
    organizationId?: string
  },
) {
  return await findBetterAuthRow<BetterAuthTeam>(
    ctx,
    'team',
    [
      { field: '_id', value: args.teamId },
      args.organizationId ? { field: 'organizationId', value: args.organizationId } : null,
    ].filter((where): where is { field: string; value: string } => where !== null),
  )
}

export async function getBetterAuthTeamMember(
  ctx: Ctx,
  args: {
    teamId: string
    userId: string
  },
) {
  return await findBetterAuthRow<BetterAuthTeamMember>(ctx, 'teamMember', [
    { field: 'teamId', value: args.teamId },
    { field: 'userId', value: args.userId },
  ])
}

export async function listBetterAuthTeamMembers(ctx: Ctx, teamId: string) {
  return await listBetterAuthRows<BetterAuthTeamMember>(ctx, {
    model: 'teamMember',
    where: [{ field: 'teamId', value: teamId }],
  })
}

export async function listBetterAuthOrganizationMembers(ctx: Ctx, organizationId: string) {
  const members = await listBetterAuthRows<BetterAuthMember>(ctx, {
    model: 'member',
    where: [{ field: 'organizationId', value: organizationId }],
  })

  const userIds = Array.from(new Set(members.map((member) => member.userId)))
  const users =
    userIds.length === 0
      ? []
      : await listBetterAuthRows<BetterAuthUser>(ctx, {
          model: 'user',
          where: [{ field: '_id', operator: 'in', value: userIds }],
        })

  const usersById = new Map(users.map((user) => [getBetterAuthRowId(user, 'user'), user]))

  return members.map((member): BetterAuthOrganizationMember => {
    const user = usersById.get(member.userId)

    return {
      id: getBetterAuthRowId(member, 'member'),
      organizationId: member.organizationId,
      userId: member.userId,
      role: member.role,
      user: user
        ? {
            id: getBetterAuthRowId(user, 'user'),
            email: user.email,
            name: user.name,
            image: user.image ?? undefined,
          }
        : undefined,
    }
  })
}
