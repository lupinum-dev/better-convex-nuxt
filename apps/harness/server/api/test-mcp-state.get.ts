import { createError, defineEventHandler } from 'h3'

import { serverConvexQuery } from '../../../../src/runtime/convex/server/convex'
import { api } from '../../convex/_generated/api'

function assertTestResetEnabled() {
  if (process.env.ALLOW_TEST_RESET !== 'true') {
    throw createError({
      statusCode: 403,
      statusMessage: 'MCP test state is disabled outside test environments.',
    })
  }
}

export default defineEventHandler(async (event) => {
  assertTestResetEnabled()

  return await serverConvexQuery(
    event,
    api.testing.getMcpVerificationState,
    {
      confirmationCode: 'READ_MCP_VERIFICATION',
    },
    { auth: 'none' },
  )
})
