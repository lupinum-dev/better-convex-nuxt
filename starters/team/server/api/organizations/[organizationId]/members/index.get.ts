import { createError, defineEventHandler, getRouterParam } from 'h3'

import { getBetterAuth } from '../../../../utils/management'

export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const result = await getBetterAuth(event, '/organization/list-members', {
    organizationId,
    limit: 100,
  })

  return result.data
})
