import { getConvexIdentityKey, type ConvexIdentityKey } from '../utils/identity-key'
import type { ConvexUser } from '../utils/types'

/**
 * Identity as ONE discriminated value (internal §6.1). Never independent booleans
 * for token/user/authenticated/loading, and never a manufactured empty-string
 * user field. `key` is always the stable Better Auth `user.id`.
 */
export type AuthIdentity =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | {
      status: 'authenticated'
      token: string
      user: ConvexUser
      key: `user:${string}`
    }

export const LOADING_IDENTITY: AuthIdentity = { status: 'loading' }
export const ANONYMOUS_IDENTITY: AuthIdentity = { status: 'anonymous' }

/**
 * Build an authenticated identity from a confirmed token + user, or fall back to
 * anonymous when the user has no stable id (a token without a resolved user is
 * not a settled identity — vNext §5.3/§5.4). Pure.
 */
export function toAuthenticatedIdentity(token: string, user: ConvexUser): AuthIdentity {
  try {
    const key = getConvexIdentityKey(user)
    if (key === 'anonymous') return ANONYMOUS_IDENTITY
    return { status: 'authenticated', token, user, key }
  } catch {
    return ANONYMOUS_IDENTITY
  }
}

/** The stable identity key for any identity value. Settled values only. */
export function identityKeyOf(identity: AuthIdentity): ConvexIdentityKey {
  return identity.status === 'authenticated' ? identity.key : 'anonymous'
}

/** The published token, or null for any non-authenticated identity. */
export function identityToken(identity: AuthIdentity): string | null {
  return identity.status === 'authenticated' ? identity.token : null
}

/** The published user, or null for any non-authenticated identity. */
export function identityUser(identity: AuthIdentity): ConvexUser | null {
  return identity.status === 'authenticated' ? identity.user : null
}
