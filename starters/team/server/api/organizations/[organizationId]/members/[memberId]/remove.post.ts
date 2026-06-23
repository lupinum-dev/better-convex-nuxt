import { createError, defineEventHandler, getRouterParam } from 'h3'

import { callBetterAuth } from '../../../../../utils/management'

export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const memberId = getRouterParam(event, 'memberId')
  if (!organizationId || !memberId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'organizationId and memberId are required',
    })
  }

  await callBetterAuth(event, '/organization/remove-member', {
    organizationId,
    memberIdOrEmail: memberId,
  })

  return { ok: true }
})
