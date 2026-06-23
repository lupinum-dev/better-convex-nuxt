import { components } from '../_generated/api'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type Ctx = QueryCtx | MutationCtx
type BetterAuthFindOneArgs = (typeof components.betterAuth.adapter.findOne)['_args']
type BetterAuthModel = BetterAuthFindOneArgs['model']

export type BetterAuthMember = {
  _id: string
  organizationId: string
  userId: string
  role: string
}

export type BetterAuthTeam = {
  _id: string
  organizationId: string
  name?: string
}

export type BetterAuthTeamMember = {
  _id: string
  teamId: string
  userId: string
}

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
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: 'teamMember',
    where: [{ field: 'teamId', value: teamId }],
    paginationOpts: {
      cursor: null,
      numItems: 100,
    },
  })

  return (Array.isArray(result) ? result : result.page) as BetterAuthTeamMember[]
}
