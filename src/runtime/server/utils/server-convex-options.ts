import type { ConvexAuthMode } from '../../utils/auth-status'

/**
 * A low-level server credential handed to {@link exchangeConvexToken} or to
 * `serverConvex` for an explicit principal . A `cookie` value is a
 * raw `Cookie` header string; a `bearer` value is the Better Auth session token
 * that becomes `Authorization: Bearer <value>`.
 */
export type ConvexCredential = { type: 'cookie'; value: string } | { type: 'bearer'; value: string }

/**
 * Public per-caller options for `serverConvex` ("Final types").
 *
 * - `auth` selects the auth policy for cookie-based resolution.
 * - `authToken` is an explicit opaque JWT the caller already holds.
 * - `credential` is an explicit cookie/bearer principal to exchange.
 *
 * `authToken` and `credential` are mutually exclusive, and either one forces an
 * explicit-principal policy (see {@link validateServerConvexOptions}).
 */
export interface ServerConvexOptions {
  auth?: ConvexAuthMode
  authToken?: string
  credential?: ConvexCredential
}

/**
 * The validated, resolved options a caller operates on. `auth` is always a
 * concrete mode: cookie-based callers default to a fixed `optional`, while an
 * explicit principal resolves to `required`.
 */
export interface NormalizedServerConvexOptions {
  auth: ConvexAuthMode
  authToken?: string
  credential?: ConvexCredential
}

/**
 * Synchronous validation failure for server-call options and credential values
 * . This is deliberately NOT a {@link ConvexCallError}: the public
 * error contract  has no `validation` kind, and an option/credential
 * contract violation is a caller programming error surfaced before any network
 * access — not a classifiable Convex call outcome. Callers that construct a
 * `serverConvex` caller or call `exchangeConvexToken` receive this synchronously,
 * before a request is ever made.
 */
export class ServerConvexValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerConvexValidationError'
  }
}

/**
 * True when `value` contains any ASCII control character (0x00–0x1F or 0x7F),
 * which includes CR (0x0D) and LF (0x0A). A credential carrying these could be
 * used for header injection / request smuggling, so it is rejected before it can
 * be placed in a request header.
 */
const ASCII_CONTROL_MAX = 31 // 0x1F
const ASCII_DEL = 127 // 0x7F

export function credentialHasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code <= ASCII_CONTROL_MAX || code === ASCII_DEL) return true
  }
  return false
}

/**
 * Reject an empty or control-character-bearing credential value synchronously,
 * before any network access . Shared by option validation and by the
 * exchange primitive so both refuse a smuggling-capable credential at the door.
 */
export function assertCredentialValueSafe(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ServerConvexValidationError(`${label} must be a non-empty string`)
  }
  if (credentialHasControlChars(value)) {
    throw new ServerConvexValidationError(`${label} must not contain control characters`)
  }
}

export function assertConvexCredentialShape(
  credential: unknown,
): asserts credential is ConvexCredential {
  if (!credential || typeof credential !== 'object') {
    throw new ServerConvexValidationError('credential must be a cookie or bearer credential')
  }
  const type = (credential as { type?: unknown }).type
  if (type !== 'cookie' && type !== 'bearer') {
    throw new ServerConvexValidationError('credential must be a cookie or bearer credential')
  }
}

/**
 * Validate and normalize {@link ServerConvexOptions} synchronously (public
 * "Validation rules"). Throws {@link ServerConvexValidationError} — before any
 * network access — for every invalid combination rather than silently
 * downgrading a rejected explicit principal.
 *
 * Rules:
 * - `authToken` and `credential` are mutually exclusive.
 * - Providing either forces an omitted `auth` to `required`.
 * - An explicit principal combines only with omitted `auth` or `required`;
 *   `optional` and `none` are rejected (never silently downgraded).
 * - An empty or control-character token/credential value is rejected.
 * - With no explicit principal, cookie-based resolution defaults to a fixed
 *   `optional`.
 */
export function validateServerConvexOptions(
  options: ServerConvexOptions = {},
): NormalizedServerConvexOptions {
  const { auth, authToken, credential } = options
  const hasToken = authToken !== undefined
  const hasCredential = credential !== undefined

  if (hasToken && hasCredential) {
    throw new ServerConvexValidationError(
      'authToken and credential are mutually exclusive; provide at most one',
    )
  }

  if (hasToken) {
    assertCredentialValueSafe(authToken, 'authToken')
  }
  if (hasCredential) {
    assertConvexCredentialShape(credential)
    assertCredentialValueSafe(credential.value, 'credential value')
  }

  const hasExplicitPrincipal = hasToken || hasCredential

  if (hasExplicitPrincipal) {
    if (auth !== undefined && auth !== 'required') {
      throw new ServerConvexValidationError(
        `An explicit authToken or credential requires auth 'required' (or omitted); '${auth}' is not allowed`,
      )
    }
    return {
      auth: 'required',
      ...(hasToken ? { authToken } : {}),
      ...(hasCredential ? { credential } : {}),
    }
  }

  // No explicit principal: cookie-based event resolution. Default to a fixed
  // `optional` policy when auth is omitted.
  return { auth: auth ?? 'optional' }
}
