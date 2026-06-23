import type { OrganizationRole } from '~~/shared/organizationRoles'
import { isOrganizationRole } from '~~/shared/organizationRoles'

export type Team = {
  id: string
  name: string
  organizationId: string
}

export type Member = {
  id: string
  organizationId: string
  userId: string
  role: OrganizationRole
  user?: {
    id: string
    email: string
    name: string
    image?: string
  }
}

export type TeamMember = {
  id: string
  teamId: string
  userId: string
}

function asRecord(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} response was invalid`)
  }

  return value as Record<string, unknown>
}

function stringField(value: Record<string, unknown>, field: string, label: string) {
  const nextValue = value[field]
  if (typeof nextValue !== 'string') {
    throw new Error(`${label} response was missing ${field}`)
  }

  return nextValue
}

function optionalUser(value: unknown): Member['user'] {
  if (value === undefined) return undefined

  const user = asRecord(value, 'Member user')
  return {
    id: stringField(user, 'id', 'Member user'),
    email: stringField(user, 'email', 'Member user'),
    name: stringField(user, 'name', 'Member user'),
    image: typeof user.image === 'string' ? user.image : undefined,
  }
}

export function parseTeam(value: unknown): Team {
  const team = asRecord(value, 'Team')
  return {
    id: stringField(team, 'id', 'Team'),
    name: stringField(team, 'name', 'Team'),
    organizationId: stringField(team, 'organizationId', 'Team'),
  }
}

export function parseTeams(value: unknown): Team[] {
  if (!Array.isArray(value)) throw new Error('Teams response was invalid')
  return value.map(parseTeam)
}

function parseMember(value: unknown): Member {
  const member = asRecord(value, 'Member')
  const role = stringField(member, 'role', 'Member')
  if (!isOrganizationRole(role)) {
    throw new Error('Member response had an invalid role')
  }

  return {
    id: stringField(member, 'id', 'Member'),
    organizationId: stringField(member, 'organizationId', 'Member'),
    userId: stringField(member, 'userId', 'Member'),
    role,
    user: optionalUser(member.user),
  }
}

export function parseMembersResponse(value: unknown): Member[] {
  const response = asRecord(value, 'Members')
  if (!Array.isArray(response.members)) throw new Error('Members response was invalid')
  return response.members.map(parseMember)
}

function parseTeamMember(value: unknown): TeamMember {
  const member = asRecord(value, 'Team member')
  return {
    id: stringField(member, 'id', 'Team member'),
    teamId: stringField(member, 'teamId', 'Team member'),
    userId: stringField(member, 'userId', 'Team member'),
  }
}

export function parseTeamMembers(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) throw new Error('Team members response was invalid')
  return value.map(parseTeamMember)
}
