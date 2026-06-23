import { createError, defineEventHandler, getRouterParam } from 'h3'

import { api } from '#convex/api'
import { serverConvexQuery } from '#convex/server'

import { callBetterAuth, readJsonObject, readTrimmedString } from '../../../../utils/management'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId')
  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'teamId is required' })
  }

  const body = await readJsonObject(event)
  const userId = readTrimmedString(body, 'userId', 'userId is required')
  const teamAccess = await serverConvexQuery(
    event,
    api.teamAccess.resolveForManagement,
    { teamId, permission: 'delete' },
    { auth: 'required' },
  )

  await callBetterAuth(event, '/organization/remove-team-member', {
    organizationId: teamAccess.organizationId,
    teamId,
    userId,
  })

  return { ok: true }
})
