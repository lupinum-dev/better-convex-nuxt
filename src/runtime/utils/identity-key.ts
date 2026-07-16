import type { ConvexUser } from './types'

/**
 * Stable identity cache dimension .
 *
 * `'anonymous'` covers every unauthenticated identity; `user:${string}` is the
 * Better Auth `user.id` and is the ONLY stable partition key. It is never a JWT,
 * never a token hash, and never derived from the token, so same-user token
 * rotation keeps the key stable while switching users always changes it.
 */
export type ConvexIdentityKey = 'anonymous' | `user:${string}`

/**
 * The single stable-user-ID extraction function.
 *
 * Use this everywhere an identity-varying holder is keyed: SSR snapshots, client
 * auth, cache keys, payload keys, subscription keys, and identity generation.
 * There is deliberately exactly one implementation .
 *
 * @throws TypeError when a user is present but has no non-empty string `id`.
 *   A token without a resolved user id is not a settled identity and must keep
 *   auth-gated queries waiting; it must never produce `user:undefined`.
 */
export function getConvexIdentityKey(user: ConvexUser | null): ConvexIdentityKey {
  if (!user) return 'anonymous'
  if (typeof user.id !== 'string' || user.id.length === 0) {
    throw new TypeError('Authenticated Convex user is missing a stable Better Auth user id')
  }
  return `user:${user.id}`
}

/** True when the key names a concrete authenticated subject (`user:<id>`). */
export function isAuthenticatedIdentityKey(key: ConvexIdentityKey | null): key is `user:${string}` {
  return typeof key === 'string' && key.startsWith('user:')
}
