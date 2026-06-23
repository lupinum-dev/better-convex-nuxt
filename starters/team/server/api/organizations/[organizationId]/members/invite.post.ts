import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isInviteRole } from '~~/shared/organizationRoles'

import { callBetterAuth, readJsonObject, readTrimmedString } from '../../../../utils/management'

export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const body = await readJsonObject(event)
  const email = readTrimmedString(body, 'email', 'Email is required')
  const role = typeof body.role === 'string' ? body.role.trim() : ''
  const teamId = readTrimmedString(body, 'teamId', 'teamId is required')

  if (!isInviteRole(role))
    throw createError({ statusCode: 400, statusMessage: 'Valid role is required' })

  const result = await callBetterAuth(event, '/organization/invite-member', {
    organizationId,
    email,
    role,
    teamId,
  })

  return result.data
})
