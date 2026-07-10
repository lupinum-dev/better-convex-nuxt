import type { ConvexCallError } from '../auth/identity-port'

/**
 * Stable `code` for the identity-boundary rejection (vNext §5.4).
 *
 * A handle invocation that crosses an identity generation, and every A-owned
 * consumer-held call retired during A→B replacement, rejects with this code. It
 * is deliberately NOT safe-retry evidence: a stale mutation/action may already
 * have committed under the original identity.
 */
export const IDENTITY_CHANGED = 'IDENTITY_CHANGED' as const

/**
 * Phase 1 stand-in for `ConvexCallError({ kind: 'authentication', code:
 * 'IDENTITY_CHANGED' })`. The real framework-free {@link ConvexCallError} class
 * ships in Phase 2; until then this returns a real `Error` carrying the frozen
 * placeholder fields so consumers and tests can branch on `kind`/`code` today.
 * The old result is never placed in `data` or `cause` (vNext §5.4).
 */
export function createIdentityChangedError(operation?: string): Error & ConvexCallError {
  const message = operation
    ? `Convex ${operation} rejected: the auth identity changed before it settled (${IDENTITY_CHANGED}).`
    : `Convex operation rejected: the auth identity changed (${IDENTITY_CHANGED}).`
  const error = new Error(message) as Error & ConvexCallError
  error.kind = 'authentication'
  error.code = IDENTITY_CHANGED
  return error
}

/** True when an error is the identity-boundary rejection above. */
export function isIdentityChangedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === IDENTITY_CHANGED
  )
}
