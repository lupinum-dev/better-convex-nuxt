import { components } from '../_generated/api'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type Ctx = QueryCtx | MutationCtx
type BetterAuthFindOneArgs = (typeof components.betterAuth.adapter.findOne)['_args']
type BetterAuthModel = BetterAuthFindOneArgs['model']
type BetterAuthFindManyArgs = (typeof components.betterAuth.adapter.findMany)['_args']
type BetterAuthFindManyWhere = NonNullable<BetterAuthFindManyArgs['where']>[number]
type BetterAuthSortBy = BetterAuthFindManyArgs['sortBy']
type BetterAuthPaginationOpts = BetterAuthFindManyArgs['paginationOpts']
type BetterAuthPageResult<T extends Record<string, unknown>> = {
  page: T[]
  isDone: boolean
  continueCursor: string
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

export type BetterAuthOrganization = BetterAuthRowWithId & {
  name: string
  metadata?: string | null
}

export type BetterAuthTeamMember = BetterAuthRowWithId & {
  teamId: string
  userId: string
}

export type BetterAuthInvitation = BetterAuthRowWithId & {
  organizationId: string
  email: string
  role?: string | null
  teamId?: string | null
  status: string
  expiresAt: number
  createdAt: number
  inviterId: string
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
  isTeamMember: boolean
}

export type BetterAuthOrganizationInvitation = {
  email: string
  role?: string | null
  teamId?: string
  teamName?: string
  status: string
  expiresAt: number
  createdAt: number
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

function getBetterAuthRowId(row: BetterAuthRowWithId, label: string) {
  const id = row.id ?? row._id
  if (!id) {
    throw new Error(`Better Auth ${label} row missing id`)
  }

  return id
}

async function listBetterAuthRowsPage<T extends Record<string, unknown>>(
  ctx: Ctx,
  args: {
    model: BetterAuthModel
    where?: BetterAuthFindManyWhere[]
    sortBy?: BetterAuthSortBy
    paginationOpts: BetterAuthPaginationOpts
  },
) {
  return (await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: args.model,
    where: args.where,
    sortBy: args.sortBy,
    paginationOpts: args.paginationOpts,
  })) as BetterAuthPageResult<T>
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

export async function getBetterAuthOrganization(
  ctx: Ctx,
  args: {
    organizationId: string
  },
) {
  return await findBetterAuthRow<BetterAuthOrganization>(ctx, 'organization', [
    { field: '_id', value: args.organizationId },
  ])
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

export async function getBetterAuthInvitation(
  ctx: Ctx,
  args: {
    invitationId: string
  },
) {
  return await findBetterAuthRow<BetterAuthInvitation>(ctx, 'invitation', [
    { field: '_id', value: args.invitationId },
  ])
}

export async function getBetterAuthPendingInvitationByEmail(
  ctx: Ctx,
  args: {
    organizationId: string
    email: string
  },
) {
  return await findBetterAuthRow<BetterAuthInvitation>(ctx, 'invitation', [
    { field: 'organizationId', value: args.organizationId },
    { field: 'email', value: args.email },
    { field: 'status', value: 'pending' },
  ])
}

export async function listBetterAuthOrganizationInvitationsPage(
  ctx: Ctx,
  organizationId: string,
  paginationOpts: BetterAuthPaginationOpts,
) {
  const invitations = await listBetterAuthRowsPage<BetterAuthInvitation>(ctx, {
    model: 'invitation',
    where: [
      { field: 'organizationId', value: organizationId },
      { field: 'status', value: 'pending' },
    ],
    sortBy: { field: 'createdAt', direction: 'desc' },
    paginationOpts,
  })

  const teamIds = Array.from(
    new Set(
      invitations.page
        .map((invitation) => invitation.teamId ?? undefined)
        .filter((teamId): teamId is string => typeof teamId === 'string' && teamId.length > 0),
    ),
  )
  const teams =
    teamIds.length === 0
      ? []
      : (
          await listBetterAuthRowsPage<BetterAuthTeam>(ctx, {
            model: 'team',
            where: [{ field: '_id', operator: 'in', value: teamIds }],
            paginationOpts: { cursor: null, numItems: teamIds.length },
          })
        ).page
  const teamsById = new Map(teams.map((team) => [getBetterAuthRowId(team, 'team'), team]))

  return {
    ...invitations,
    page: invitations.page.map((invitation): BetterAuthOrganizationInvitation => {
      const teamId = invitation.teamId ?? undefined
      const team = teamId ? teamsById.get(teamId) : undefined

      return {
        email: invitation.email,
        role: invitation.role ?? undefined,
        teamId,
        teamName: team?.name,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      }
    }),
  }
}

export async function listBetterAuthOrganizationMembersPage(
  ctx: Ctx,
  args: {
    organizationId: string
    teamId?: string
    paginationOpts: BetterAuthPaginationOpts
  },
) {
  const members = await listBetterAuthRowsPage<BetterAuthMember>(ctx, {
    model: 'member',
    where: [{ field: 'organizationId', value: args.organizationId }],
    paginationOpts: args.paginationOpts,
  })

  const userIds = Array.from(new Set(members.page.map((member) => member.userId)))
  const users =
    userIds.length === 0
      ? []
      : (
          await listBetterAuthRowsPage<BetterAuthUser>(ctx, {
            model: 'user',
            where: [{ field: '_id', operator: 'in', value: userIds }],
            paginationOpts: { cursor: null, numItems: userIds.length },
          })
        ).page
  const teamMembers =
    !args.teamId || userIds.length === 0
      ? []
      : (
          await listBetterAuthRowsPage<BetterAuthTeamMember>(ctx, {
            model: 'teamMember',
            where: [
              { field: 'teamId', value: args.teamId },
              { field: 'userId', operator: 'in', value: userIds },
            ],
            paginationOpts: { cursor: null, numItems: userIds.length },
          })
        ).page

  const usersById = new Map(users.map((user) => [getBetterAuthRowId(user, 'user'), user]))
  const teamMemberUserIds = new Set(teamMembers.map((member) => member.userId))

  return {
    ...members,
    page: members.page.map((member): BetterAuthOrganizationMember => {
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
        isTeamMember: teamMemberUserIds.has(member.userId),
      }
    }),
  }
}
