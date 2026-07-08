import { fetchWithTimeout } from './http'

/** Better Auth HTTP endpoint that mints a Convex JWT from a session cookie. */
const TOKEN_EXCHANGE_PATH = '/api/auth/convex/token'

/** Default timeout for the cookie -> JWT exchange (matches the SSR snapshot). */
const DEFAULT_TOKEN_EXCHANGE_TIMEOUT_MS = 5_000

export interface SessionTokenExchangeResult {
  /** JWT returned by the exchange, or null when upstream returned no token. */
  token: string | null
  /** Upstream HTTP status, or undefined when the request threw / timed out. */
  status: number | undefined
  /** The thrown error when the request failed to complete, else undefined. */
  thrown: unknown
}

/**
 * The single Better Auth cookie -> Convex JWT exchange implementation (F-13).
 *
 * Both the SSR auth snapshot (`plugin.server`) and the server-route resolver
 * (`serverConvex*`) call this. It performs one timed HTTP request and never
 * throws — a failed request surfaces via `thrown`/`status` so each caller can
 * apply its own policy (graceful vs. required) and telemetry. Callers own
 * session-cache lookup/store (shared via `auth-cache`).
 */
export async function exchangeSessionForToken(
  siteUrl: string,
  authCookieHeader: string,
  options: { timeoutMs?: number } = {},
): Promise<SessionTokenExchangeResult> {
  try {
    const response = await fetchWithTimeout(`${siteUrl}${TOKEN_EXCHANGE_PATH}`, {
      headers: { Cookie: authCookieHeader },
      timeoutMs: options.timeoutMs ?? DEFAULT_TOKEN_EXCHANGE_TIMEOUT_MS,
    })
    if (!response.ok) {
      return { token: null, status: response.status, thrown: undefined }
    }
    const body = (await response.json().catch(() => null)) as { token?: string } | null
    return { token: body?.token ?? null, status: response.status, thrown: undefined }
  } catch (error) {
    return { token: null, status: undefined, thrown: error }
  }
}
