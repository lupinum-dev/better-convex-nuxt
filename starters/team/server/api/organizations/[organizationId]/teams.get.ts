import { createError, defineEventHandler, getRouterParam } from 'h3'

import { api } from '#convex/api'
import { serverConvexQuery } from '#convex/server'

import { getBetterAuth } from '../../../utils/management'

type Team = {
  id: string
  name: string
  organizationId: string
}

function parseTeam(value: unknown): Team {
  if (!value || typeof value !== 'object') {
    throw createError({ statusCode: 502, statusMessage: 'Better Auth team response was invalid' })
  }

  const team = value as Record<string, unknown>
  if (
    typeof team.id !== 'string' ||
    typeof team.name !== 'string' ||
    typeof team.organizationId !== 'string'
  ) {
    throw createError({ statusCode: 502, statusMessage: 'Better Auth team response was invalid' })
  }

  return {
    id: team.id,
    name: team.name,
    organizationId: team.organizationId,
  }
}

function parseTeams(value: unknown) {
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 502, statusMessage: 'Better Auth teams response was invalid' })
  }

  return value.map(parseTeam)
}

export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Organization id is required',
    })
  }

  const capabilities = await serverConvexQuery(
    event,
    api.organizationAccess.getCapabilities,
    { organizationId },
    { auth: 'required' },
  )

  const result = capabilities.canManageTeams
    ? await getBetterAuth(event, '/organization/list-teams', { organizationId })
    : await getBetterAuth(event, '/organization/list-user-teams')

  return parseTeams(result.data).filter((team) => team.organizationId === organizationId)
})
