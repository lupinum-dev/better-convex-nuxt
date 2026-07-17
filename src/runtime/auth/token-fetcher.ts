import {
  decodeUserFromJwt,
  isJwtUsable,
  TOKEN_EXPIRY_SAFETY_BUFFER_MS,
} from '../utils/convex-shared'
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

export { TOKEN_EXPIRY_SAFETY_BUFFER_MS }

/** Coalesced-retry backoff schedule (architecture invariant): 1, 2, 4, 8, 16, then 30s. */
export const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const

/** Bounded transient-retry attempts inside a single fetch call. */
export const MAX_FETCH_ATTEMPTS = 4

/** Total browser budget for one Better Auth -> Convex token exchange cycle. */
const TOKEN_EXCHANGE_TIMEOUT_MS = 5_000
const TOKEN_EXCHANGE_TIMED_OUT = Symbol('TOKEN_EXCHANGE_TIMED_OUT')
const TOKEN_EXCHANGE_CANCELLED = Symbol('TOKEN_EXCHANGE_CANCELLED')
const TOKEN_EXCHANGE_TIMEOUT_MESSAGE = 'Convex authentication token exchange timed out'
const TOKEN_EXCHANGE_CANCELLED_MESSAGE = 'Convex authentication token exchange was cancelled'
const TOKEN_EXCHANGE_FAILURE_MESSAGE = 'Authentication is temporarily unavailable'

/**
 * A token is retainable only while it carries a valid required `exp` still in
 * the future beyond the safety buffer. A token without a valid `exp`, or at/after
 * expiry, is never retained (architecture invariant).
 */
export function isTokenUsable(token: string | null, nowMs = Date.now()): token is string {
  return isJwtUsable(token, nowMs)
}

/**
 * A settled token WITHOUT a non-empty Better Auth `user.id` is an authentication
 * error : decode returns null and the token is discarded, never
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
 * Total Convex-token fetch; never throws.
 *
 * Runs a bounded transient-retry loop over the Better Auth exchange within one
 * fixed browser deadline, validating each returned token's `exp`. Returns a
 * decoded identity on success, a clean anonymous outcome when the exchange
 * reports no session, or a definitive error outcome when every attempt fails. A
 * rejecting or never-settling exchange is totalized for the Convex caller.
 */
export async function fetchConvexToken(
  source: ConvexTokenSource,
  options: { maxAttempts?: number; nowMs?: () => number; signal?: AbortSignal } = {},
): Promise<FetchOutcome> {
  if (options.signal?.aborted) {
    return {
      identity: null,
      authError: TOKEN_EXCHANGE_CANCELLED_MESSAGE,
      definitive: false,
    }
  }
  const maxAttempts = options.maxAttempts ?? MAX_FETCH_ATTEMPTS
  const now = options.nowMs ?? Date.now
  let lastError: string | null = null
  const controller = new AbortController()
  let timedOut = false
  let externallyCancelled = false
  let timeout: ReturnType<typeof setTimeout> | null = null
  const deadline = new Promise<typeof TOKEN_EXCHANGE_TIMED_OUT>((resolve) => {
    timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
      resolve(TOKEN_EXCHANGE_TIMED_OUT)
    }, TOKEN_EXCHANGE_TIMEOUT_MS)
  })
  let removeExternalAbort = () => {}
  const cancellation = new Promise<typeof TOKEN_EXCHANGE_CANCELLED>((resolve) => {
    const externalSignal = options.signal
    if (!externalSignal) return
    const cancel = () => {
      externallyCancelled = true
      resolve(TOKEN_EXCHANGE_CANCELLED)
      controller.abort()
    }
    externalSignal.addEventListener('abort', cancel, { once: true })
    removeExternalAbort = () => externalSignal.removeEventListener('abort', cancel)
    if (externalSignal.aborted) cancel()
  })

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (externallyCancelled) {
        lastError = TOKEN_EXCHANGE_CANCELLED_MESSAGE
        break
      }
      try {
        // `signal` releases the real Better Fetch request; the explicit race is
        // still required to totalize a custom/plugin source that ignores abort.
        const exchange = source.convex.token({
          fetchOptions: { throw: false, signal: controller.signal },
        })
        const response = await Promise.race([exchange, deadline, cancellation])
        if (response === TOKEN_EXCHANGE_CANCELLED) {
          lastError = TOKEN_EXCHANGE_CANCELLED_MESSAGE
          break
        }
        if (response === TOKEN_EXCHANGE_TIMED_OUT) {
          lastError = TOKEN_EXCHANGE_TIMEOUT_MESSAGE
          break
        }
        if (response.error) {
          // A 401/403 is Better Auth reporting that there is no session to
          // exchange — a definitive anonymous outcome, identical to an absent
          // token, NOT an authentication failure. Better Convex Nuxt's
          // `/convex/token` returns `401 UNAUTHORIZED` for every session-less
          // request, so surfacing it as an `authError` would push every anonymous
          // visitor's `optional`/`required` queries into the auth-error gate branch
          // (which never executes and tears the live subscription down). Settle
          // anonymous with the error cleared, matching this outcome's documented
          // 401/403 contract and the server plugin's no-cookie settlement.
          if (isDefinitiveAuthStatus(response.error)) {
            return { identity: null, authError: null, definitive: true }
          }
          lastError = TOKEN_EXCHANGE_FAILURE_MESSAGE
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
      } catch {
        if (externallyCancelled) {
          lastError = TOKEN_EXCHANGE_CANCELLED_MESSAGE
          break
        }
        if (timedOut) {
          lastError = TOKEN_EXCHANGE_TIMEOUT_MESSAGE
          break
        }
        lastError = TOKEN_EXCHANGE_FAILURE_MESSAGE
      }
    }
  } finally {
    removeExternalAbort()
    if (timeout !== null) clearTimeout(timeout)
  }

  // Exhausted transient retries: a still-usable identity may be retained.
  return {
    identity: null,
    authError: lastError ?? TOKEN_EXCHANGE_FAILURE_MESSAGE,
    definitive: false,
  }
}

/** True when a Better Auth error envelope reports HTTP 401/403. */
function isDefinitiveAuthStatus(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const status = (error as { status?: unknown }).status
  return status === 401 || status === 403
}
