/**
 * Detects a structurally-signaled *authentication* failure (401 / an
 * explicit UNAUTHENTICATED-style code) - never an *authorization* failure
 * (403/FORBIDDEN) and never a prose-message guess.
 *
 * This backs `handleUnauthorizedAuthFailure`, which signs the user out on a
 * match. Sign-out is destructive (it can drop an otherwise-valid session),
 * so this only trusts structured signals a server explicitly set - never
 * substrings of a human-readable error message, which routinely contain the
 * word "authentication" without meaning "your session is invalid" (e.g. a
 * 403 "Two-factor authentication required" or a generic permission-denied
 * message). F-24.
 */
export function isConvexUnauthorizedError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const record = error as { status?: unknown; code?: unknown; data?: unknown }
    const status = typeof record.status === 'number' ? record.status : undefined
    if (status === 401) {
      return true
    }

    const code = typeof record.code === 'string' ? record.code.toUpperCase() : ''
    if (code.includes('UNAUTH')) {
      return true
    }

    if (record.data && typeof record.data === 'object') {
      const data = record.data as { status?: unknown; code?: unknown }
      const dataStatus = typeof data.status === 'number' ? data.status : undefined
      if (dataStatus === 401) {
        return true
      }
      const dataCode = typeof data.code === 'string' ? data.code.toUpperCase() : ''
      if (dataCode.includes('UNAUTH')) {
        return true
      }
    }
  }

  return false
}
