/**
 * Test JWT minting utilities.
 *
 * Produces structurally valid but unsigned JWTs (`alg: "none"`) for unit
 * tests. The `decodeUserFromJwt` function in production code parses the
 * payload but does not verify signatures, so these tokens work in tests.
 *
 * `TEST_USERS` provides pre-built alice/bob test identities with lazy
 * getters — each access to `.token` mints a fresh JWT with current `iat`/`exp`.
 *
 * @module jwt-factory
 */
export interface JwtPayload {
  sub?: string
  userId?: string
  name?: string
  email?: string
  emailVerified?: boolean
  image?: string
  iat?: number
  exp?: number
  iss?: string
  aud?: string | string[]
  [key: string]: unknown
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const HEADER = toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
const SIGNATURE = 'test-signature'

/** Mint a test JWT with default `iat` (now) and `exp` (now + 1h). */
export function mintJwt(payload: JwtPayload): string {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JwtPayload = {
    iat: now,
    exp: now + 3600,
    ...payload,
  }

  return `${HEADER}.${toBase64Url(JSON.stringify(fullPayload))}.${SIGNATURE}`
}

/** Mint a JWT that expired `agoMs` milliseconds ago (default: 60s). */
export function mintExpiredJwt(payload: JwtPayload, agoMs = 60_000): string {
  const now = Math.floor(Date.now() / 1000)
  const offset = Math.floor(agoMs / 1000)
  return mintJwt({
    ...payload,
    iat: now - offset - 3600,
    exp: now - offset,
  })
}

/** Mint a JWT that expires in `ms` milliseconds from now. */
export function mintJwtExpiringIn(payload: JwtPayload, ms: number): string {
  const now = Math.floor(Date.now() / 1000)
  return mintJwt({
    ...payload,
    iat: now,
    exp: now + Math.floor(ms / 1000),
  })
}

/** Extract a ConvexUser-shaped object from a JWT payload, or null if no valid id. */
export function userFromPayload(payload: JwtPayload) {
  const id = payload.sub || payload.userId
  if (typeof id !== 'string' || id.length === 0) {
    return null
  }

  return {
    id,
    name: String(payload.name || ''),
    email: String(payload.email || ''),
    emailVerified: typeof payload.emailVerified === 'boolean' ? payload.emailVerified : undefined,
    image: typeof payload.image === 'string' ? payload.image : undefined,
  }
}

export const TEST_USERS = {
  alice: {
    payload: { sub: 'user-alice', name: 'Alice', email: 'alice@test.com' },
    get token() {
      return mintJwt(this.payload)
    },
    get user() {
      return userFromPayload(this.payload)!
    },
  },
  bob: {
    payload: { sub: 'user-bob', name: 'Bob', email: 'bob@test.com' },
    get token() {
      return mintJwt(this.payload)
    },
    get user() {
      return userFromPayload(this.payload)!
    },
  },
} as const
