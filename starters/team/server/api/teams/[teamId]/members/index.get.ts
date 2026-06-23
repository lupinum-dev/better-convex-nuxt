import { createError, defineEventHandler, getRouterParam } from 'h3'

import { api } from '#convex/api'
import { serverConvexQuery } from '#convex/server'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId')
  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'teamId is required' })
  }

  return await serverConvexQuery(
    event,
    api.teamAccess.listMembers,
    { teamId },
    { auth: 'required' },
  )
})
