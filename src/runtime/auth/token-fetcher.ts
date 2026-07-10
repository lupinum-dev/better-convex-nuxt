import { decodeUserFromJwt, getJwtTimeUntilExpiryMs } from '../utils/convex-shared'
import type { ConvexUser } from '../utils/types'

/**
 * Better Auth Convex-plugin surface used to exchange the session for a JWT.
 * `convex.token()` returns `{ data: { token } | null, error }` and, with
 * `fetchOptions.throw = false`, resolves rather than throwing on HTTP failure.
 */
export interface ConvexTokenSource {
  convex: {
    token: (options?: unknown) => Promise<{ data?: { token: string } | null; error?: unknown }>
  }
}

/** A confirmed candidate identity produced by a successful token exchange. */
export interface FetchedIdentity {
  token: string
  user: ConvexUser
}

/** Milliseconds before `exp` at which a token is treated as no longer usable. */
export const TOKEN_EXPIRY_SAFETY_BUFFER_MS = 30_000

/** Coalesced-retry backoff schedule (internal §6.5): 1, 2, 4, 8, 16, then 30s. */
export const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const

/** Bounded transient-retry attempts inside a single fetch call (proof: fetcher-retry). */
export const MAX_FETCH_ATTEMPTS = 4

/**
 * A token is retainable only while it carries a valid required `exp` still in
 * the future beyond the safety buffer. A token without a valid `exp`, or at/after
 * expiry, is never retained (internal §6.5).
 */
export function isTokenUsable(token: string | null, nowMs = Date.now()): token is string {
  if (!token) return false
  const timeUntilExpiry = getJwtTimeUntilExpiryMs(token, nowMs)
  if (timeUntilExpiry === null) return false
  return timeUntilExpiry > TOKEN_EXPIRY_SAFETY_BUFFER_MS
}

/**
 * A settled token WITHOUT a non-empty Better Auth `user.id` is an authentication
 * error (vNext §5.3): decode returns null and the token is discarded, never
 * installed. Returns `null` for a token that decodes to no usable user.
 */
export function decodeFetchedIdentity(token: string): FetchedIdentity | null {
  const user = decodeUserFromJwt(token)
  if (!user || typeof user.id !== 'string' || user.id.length === 0) return null
  return { token, user }
}

/**
 * The outcome of one total token fetch. `identity: null` with `authError: null`
 * is a clean anonymous result — reported both when the exchange returns no token
 * and when it returns a definitive 401/403 (no session to exchange; the session
 * is treated as absent/ended and any prior error cleared). `authError` is set
 * only for a genuine failure: a token that decodes without a stable user id, or a
 * transient transport failure that exhausts the retry loop. `definitive`
 * distinguishes such a transient (non-definitive) failure — over which a usable
 * identity is retained — from the definitive verdicts above. Never rejects.
 */
export interface FetchOutcome {
  identity: FetchedIdentity | null
  authError: string | null
  definitive: boolean
}

/**
 * Total Convex-token fetch (never throws; proof `proof-total-fetcher-retry`).
 *
 * Runs a bounded transient-retry loop over the Better Auth exchange, validating
 * each returned token's `exp`. Returns a decoded identity on success, a clean
 * anonymous outcome when the exchange reports no session, or a definitive error
 * outcome when every attempt fails. A rejecting exchange is caught (the fetcher
 * passed to Convex must be total).
 */
export async function fetchConvexToken(
  source: ConvexTokenSource,
  options: { maxAttempts?: number; nowMs?: () => number } = {},
): Promise<FetchOutcome> {
  const maxAttempts = options.maxAttempts ?? MAX_FETCH_ATTEMPTS
  const now = options.nowMs ?? Date.now
  let lastError: string | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await source.convex.token({ fetchOptions: { throw: false } })
      if (response.error) {
        // A 401/403 is Better Auth reporting that there is no session to
        // exchange — a definitive anonymous outcome, identical to an absent
        // token, NOT an authentication failure. `@convex-dev/better-auth`'s
        // `/convex/token` returns `401 UNAUTHORIZED` for every session-less
        // request, so surfacing it as an `authError` would push every anonymous
        // visitor's `optional`/`required` queries into the auth-error gate branch
        // (which never executes and tears the live subscription down). Settle
        // anonymous with the error cleared, matching this outcome's documented
        // 401/403 contract and the server plugin's no-cookie settlement.
        if (isDefinitiveAuthStatus(response.error)) {
          return { identity: null, authError: null, definitive: true }
        }
        lastError = normalizeErrorMessage(response.error)
        continue
      }
      const token = response.data?.token
      if (!token) {
        // Clean anonymous outcome: the exchange reported no session.
        return { identity: null, authError: null, definitive: true }
      }
      if (!isTokenUsable(token, now())) {
        lastError = 'Convex authentication token is expired or missing a valid expiry'
        continue
      }
      const identity = decodeFetchedIdentity(token)
      if (!identity) {
        // Token without a usable user id is an authentication error; discard it.
        return {
          identity: null,
          authError: 'Convex authentication token is missing a stable user id',
          definitive: true,
        }
      }
      return { identity, authError: null, definitive: false }
    } catch (error) {
      lastError = normalizeErrorMessage(error)
    }
  }

  // Exhausted transient retries: a still-usable identity may be retained.
  return {
    identity: null,
    authError: lastError ?? 'Convex authentication failed',
    definitive: false,
  }
}

/** True when a Better Auth error envelope reports HTTP 401/403. */
function isDefinitiveAuthStatus(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const status = (error as { status?: unknown }).status
  return status === 401 || status === 403
}

function normalizeErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  if (typeof value === 'string' && value.length > 0) return value
  return 'Convex authentication failed'
}
