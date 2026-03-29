import { buildAuthTokenDecodeFailureMessage } from '../../utils/auth-errors'
import type { ConvexUser } from '../../utils/types'
import type { ResolvedRequestAuth } from './auth-resolver'

export interface HydratedRequestAuth {
  token: string | null
  user: ConvexUser | null
  error: string | null
  decodeFailed: boolean
}

export function projectResolvedAuthForHydration(
  resolvedAuth: ResolvedRequestAuth,
): HydratedRequestAuth {
  if (resolvedAuth.token && resolvedAuth.jwtDecodeFailed) {
    return {
      token: null,
      user: null,
      error: buildAuthTokenDecodeFailureMessage(),
      decodeFailed: true,
    }
  }

  return {
    token: resolvedAuth.token,
    user: resolvedAuth.user,
    error: resolvedAuth.error,
    decodeFailed: false,
  }
}
