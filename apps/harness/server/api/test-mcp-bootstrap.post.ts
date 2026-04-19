import { createError, defineEventHandler } from 'h3'

import { serverConvexMutation } from '../../../../src/runtime/convex/server/convex'
import { api } from '../../convex/_generated/api'

function assertTestResetEnabled() {
  if (process.env.ALLOW_TEST_RESET !== 'true') {
    throw createError({
      statusCode: 403,
      statusMessage: 'MCP test bootstrap is disabled outside test environments.',
    })
  }
}

export default defineEventHandler(async (event) => {
  assertTestResetEnabled()

  await serverConvexMutation(
    event,
    api.testing.clearAllData,
    {
      confirmationCode: 'RESET_DB_FOR_TESTS',
    },
    { auth: 'none' },
  )

  return await serverConvexMutation(
    event,
    api.testing.seedMcpVerification,
    {
      confirmationCode: 'SEED_MCP_VERIFICATION',
    },
    { auth: 'none' },
  )
})
