import { createError, defineEventHandler, getRouterParam } from 'h3'

import { callBetterAuth, readJsonObject, readTrimmedString } from '../../../utils/management'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId')
  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'teamId is required' })
  }

  const body = await readJsonObject(event)
  const name = readTrimmedString(body, 'name', 'Team name is required')

  const result = await callBetterAuth(event, '/organization/update-team', {
    teamId,
    data: { name },
  })

  return result.data
})
