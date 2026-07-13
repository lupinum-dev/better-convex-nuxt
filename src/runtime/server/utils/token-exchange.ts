import { ConvexCallError } from '../../utils/call-result'
import { normalizeConvexSiteUrl } from '../../utils/site-url'
import { fetchWithTimeout } from './http'
import type { ConvexCredential } from './server-convex-options'
import { assertCredentialValueSafe, ServerConvexValidationError } from './server-convex-options'

/** Better Auth HTTP endpoint that mints a Convex JWT from a session cookie/bearer. */
const TOKEN_EXCHANGE_PATH = '/api/auth/convex/token'

/** Default timeout for the credential -> JWT exchange. */
const DEFAULT_TOKEN_EXCHANGE_TIMEOUT_MS = 5_000

/** Maximum bytes read from an exchange response body before it is rejected. */
const MAX_EXCHANGE_BODY_BYTES = 1_048_576

/**
 * The never-throwing result of a cookie/bearer -> Convex JWT exchange
 * (vNext §9, internal §10.3).
 *
 * Success returns a non-null `token`, a 2xx `status`, and `error: null`.
 * A network/HTTP failure returns `token: null`, exactly one `error`, and the
 * upstream `status` when one exists. This is intentionally NOT an
 * `ok`-discriminated union; the invariants above are pinned by tests.
 */
export interface ConvexTokenExchangeResult {
  token: string | null
  status: number | undefined
  error: ConvexCallError | null
}

// ---------------------------------------------------------------------------
// normalizeSiteUrl (vNext §9)
// ---------------------------------------------------------------------------

/**
 * Normalize a Convex site origin (e.g. `https://example.convex.site`) to its
 * bare origin, rejecting anything that could redirect a credential elsewhere or
 * carry it in the URL (vNext §9).
 *
 * Rejects embedded credentials, query strings, fragments, and non-root paths.
 * Accepts `http:` ONLY for `localhost`, a `*.localhost` subdomain, IPv4 loopback
 * in `127.0.0.0/8`, or `[::1]`; every other origin requires `https:`. There is no
 * runtime "test fixture" exemption.
 */
export function normalizeSiteUrl(siteUrl: string): string {
  try {
    return normalizeConvexSiteUrl(siteUrl)
  } catch (error) {
    throw new ServerConvexValidationError(
      error instanceof Error ? error.message : 'invalid siteUrl',
    )
  }
}

// ---------------------------------------------------------------------------
// readBoundedJson / readToken (vNext §9)
// ---------------------------------------------------------------------------

/**
 * Read at most `maxBytes` of a response body and parse it as JSON. An oversized
 * body is cancelled/drained before the bounded-response error is thrown so the
 * underlying connection is not leaked (vNext §9). Malformed JSON throws. Both
 * failures are caught by {@link exchangeConvexToken} and surfaced as `transport`.
 */
export async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const body = response.body
  if (!body) {
    // No streaming body. A real WHATWG/undici Response always exposes `.body`,
    // so this branch only handles synthesized Response-likes. Apply the bound to
    // `.text()` when available, else fall back to `.json()` (a minimal mock).
    if (typeof response.text === 'function') {
      const text = await response.text()
      if (text.length > maxBytes) {
        throw new Error('Convex token exchange response exceeded the size limit')
      }
      return JSON.parse(text)
    }
    return await response.json()
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > maxBytes) {
          // Cancel the stream so an oversized/hostile body does not keep the
          // connection open or continue buffering.
          await reader.cancel()
          throw new Error('Convex token exchange response exceeded the size limit')
        }
        chunks.push(value)
      }
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder().decode(merged)
  return JSON.parse(text)
}

/** Extract a non-empty string `token` field from a parsed exchange body. */
export function readToken(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const token = (body as { token?: unknown }).token
    if (typeof token === 'string' && token.length > 0) return token
  }
  return null
}

// ---------------------------------------------------------------------------
// exchangeConvexToken (vNext §9 "Never-throwing exchange primitive")
// ---------------------------------------------------------------------------

/**
 * Exchange a cookie/bearer credential for a Convex JWT (vNext §9).
 *
 * This never throws for an exchange OUTCOME: every network, HTTP, timeout,
 * oversized, malformed, missing-token, or redirect failure is returned as a
 * {@link ConvexTokenExchangeResult} with a single {@link ConvexCallError}.
 *
 * It DOES throw synchronously — before any network access — for a credential
 * value that is empty or contains ASCII control characters (incl. CR/LF), which
 * is a caller-contract violation and header-injection vector, not an exchange
 * outcome. That guard uses {@link ServerConvexValidationError}.
 *
 * `redirect: 'error'` guarantees the credential is never delivered to a redirect
 * target: the fetch rejects before following, and that rejection surfaces through
 * the generic catch as `kind: 'transport'`. The security property is
 * zero-delivery, not the error label — the catch never inspects message text.
 */
export async function exchangeConvexToken(input: {
  siteUrl: string
  credential: ConvexCredential
  timeoutMs?: number
}): Promise<ConvexTokenExchangeResult> {
  // Synchronous, pre-network validation. A control-character or empty credential
  // is refused before it can reach a request header or the network.
  assertCredentialValueSafe(input.credential.value, 'credential value')

  const headers: Record<string, string> =
    input.credential.type === 'cookie'
      ? { Cookie: input.credential.value }
      : { Authorization: `Bearer ${input.credential.value}` }

  try {
    const response = await fetchWithTimeout(
      `${normalizeSiteUrl(input.siteUrl)}${TOKEN_EXCHANGE_PATH}`,
      {
        method: 'GET',
        headers,
        redirect: 'error',
        timeoutMs: input.timeoutMs ?? DEFAULT_TOKEN_EXCHANGE_TIMEOUT_MS,
      },
    )
    if (!response.ok) {
      return {
        token: null,
        status: response.status,
        error: new ConvexCallError({
          kind: response.status === 401 || response.status === 403 ? 'authentication' : 'transport',
          message: `Convex token exchange failed with HTTP ${response.status}`,
          status: response.status,
        }),
      }
    }

    const parsed = await readBoundedJson(response, MAX_EXCHANGE_BODY_BYTES)
    const token = readToken(parsed)
    if (!token) {
      return {
        token: null,
        status: response.status,
        error: new ConvexCallError({
          kind: 'transport',
          message: 'Convex token exchange response did not include a token',
          status: response.status,
        }),
      }
    }
    return { token, status: response.status, error: null }
  } catch (error) {
    return {
      token: null,
      status: undefined,
      error: new ConvexCallError({
        kind: 'transport',
        message: 'Convex token exchange could not complete',
        cause: error,
      }),
    }
  }
}
