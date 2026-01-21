import { defineEventHandler, setResponseStatus } from 'h3'
import { clearAuthCache } from '../../utils/auth-cache'
import { getAuthSessionToken } from '../../../utils/shared-helpers'

export default defineEventHandler(async (event) => {
  if (event.method !== 'DELETE') {
    setResponseStatus(event, 405)
    return { cleared: false }
  }

  const cookieHeader = event.headers.get('cookie')
  const sessionToken = getAuthSessionToken(cookieHeader)

  if (!sessionToken) {
    return { cleared: false }
  }

  await clearAuthCache(sessionToken)
  return { cleared: true }
})
