import { createError, defineEventHandler, getRouterParam } from 'h3'

import { callBetterAuth, readJsonObject, readTrimmedString } from '../../../utils/management'

export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const body = await readJsonObject(event)
  const name = readTrimmedString(body, 'name', 'Team name is required')

  const result = await callBetterAuth(event, '/organization/create-team', {
    organizationId,
    name,
  })

  return result.data
})
