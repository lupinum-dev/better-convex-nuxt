import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isOrganizationRole } from '~~/shared/organizationRoles'

import { callBetterAuth, readJsonObject } from '../../../../../utils/management'

export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const memberId = getRouterParam(event, 'memberId')
  if (!organizationId || !memberId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'organizationId and memberId are required',
    })
  }

  const body = await readJsonObject(event)
  const role = typeof body.role === 'string' ? body.role.trim() : ''
  if (!isOrganizationRole(role))
    throw createError({ statusCode: 400, statusMessage: 'Valid role is required' })

  const result = await callBetterAuth(event, '/organization/update-member-role', {
    organizationId,
    memberId,
    role,
  })

  return result.data
})
