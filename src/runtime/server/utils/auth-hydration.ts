/**
 * Projects server-resolved auth into a hydration-safe snapshot.
 *
 * The server auth resolver (`auth-resolver.ts`) may successfully fetch a
 * token but fail to decode the JWT payload. This module decides what to
 * send to the client in that case: a decode failure is downgraded to
 * unauthenticated with an error message, so the client never receives a
 * token it can't interpret. This is a fail-closed security decision —
 * a token without a decodable user is treated as no token.
 *
 * @module auth-hydration
 */
import { buildAuthTokenDecodeFailureMessage } from '../../utils/auth-errors'
import type { ConvexUser } from '../../utils/types'
import type { ResolvedRequestAuth } from './auth-resolver'

/**
 * Hydration-safe auth snapshot sent from server to client.
 *
 * `decodeFailed` indicates the server had a valid token but could not
 * decode the JWT — the client should treat this as unauthenticated and
 * may attempt a fresh token exchange.
 */
export interface HydratedRequestAuth {
  token: string | null
  user: ConvexUser | null
  error: string | null
  decodeFailed: boolean
}

/**
 * Project server auth into a client-safe snapshot.
 *
 * If the JWT decode failed on the server, the token is stripped and an
 * error is set — the client will see `{ token: null, error: "..." }`.
 */
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
