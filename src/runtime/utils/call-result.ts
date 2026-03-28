import type { ConvexErrorCategory, ConvexErrorIssue } from './types'

/**
 * A proper Error subclass for Convex-originated errors.
 *
 * Extends the native Error class so it works naturally with instanceof,
 * try/catch, and error boundaries. All fields from Convex's error format
 * are preserved as typed properties.
 *
 * @example
 * ```ts
 * try {
 *   await execute(args)
 * } catch (e) {
 *   if (e instanceof ConvexCallError) {
 *     console.log(e.code, e.status)
 *   }
 * }
 * ```
 */
export class ConvexCallError extends Error {
  /** Type brand for instanceof checks without importing the class. */
  readonly isConvexCallError = true as const

  /** Convex error code (e.g. "LIMIT_CALLS", "UNAUTHENTICATED"). */
  code?: string

  /** HTTP status code if available. */
  status?: number

  /** Name of the Convex helper function that raised the error. */
  helper?: string

  /** Operation type (e.g. "query", "mutation", "action"). */
  operation?: string

  /** Convex function path (e.g. "tasks:list"). */
  functionPath?: string

  /** Convex deployment URL, for cross-env debugging. */
  convexUrl?: string

  /** Auth mode that was active when the error occurred. */
  authMode?: string

  /** Semantic error category, auto-derived from code/status or set explicitly. */
  category: ConvexErrorCategory

  /** Field-level validation issues when category is 'validation'. */
  issues?: ConvexErrorIssue[]

  /** Whether the error is likely recoverable (auth, network, rate_limit). */
  get isRecoverable(): boolean {
    return this.category === 'auth' || this.category === 'network' || this.category === 'rate_limit'
  }

  constructor(
    message: string,
    init?: {
      cause?: unknown
      code?: string
      status?: number
      helper?: string
      operation?: string
      functionPath?: string
      convexUrl?: string
      authMode?: string
      category?: ConvexErrorCategory
      issues?: ConvexErrorIssue[]
    },
  ) {
    super(message, init?.cause !== undefined ? { cause: init.cause } : undefined)
    this.name = 'ConvexCallError'
    if (init) {
      this.code = init.code
      this.status = init.status
      this.helper = init.helper
      this.operation = init.operation
      this.functionPath = init.functionPath
      this.convexUrl = init.convexUrl
      this.authMode = init.authMode
      this.issues = init.issues
    }
    this.category = init?.category ?? categorizeError(this.code, this.status)
  }
}

// ============================================================================
// Error categorization
// ============================================================================

/**
 * Derive a semantic error category from an error code and/or HTTP status.
 * Code-based matching takes precedence over status-based matching.
 */
export function categorizeError(code?: string, status?: number): ConvexErrorCategory {
  if (code) {
    const upper = code.toUpperCase()
    if (upper.includes('UNAUTH') || upper === 'FORBIDDEN') return 'auth'
    if (upper.startsWith('LIMIT_')) return 'rate_limit'
    if (upper === 'NOT_FOUND') return 'not_found'
    if (upper === 'VALIDATION' || upper === 'INVALID_ARGS') return 'validation'
    if (upper === 'CONFLICT') return 'conflict'
    if (upper === 'INTERNAL_ERROR' || upper === 'INTERNAL') return 'server'
  }
  if (status !== undefined) {
    if (status === 401 || status === 403) return 'auth'
    if (status === 400 || status === 422) return 'validation'
    if (status === 404) return 'not_found'
    if (status === 409) return 'conflict'
    if (status === 429) return 'rate_limit'
    if (status >= 500) return 'server'
  }
  return 'unknown'
}

// ============================================================================
// Internal parsing helpers
// ============================================================================

const LIMIT_ERROR_MARKER = 'LIMIT_'

interface ConvexErrorLike {
  data?: unknown
  message?: unknown
  status?: unknown
  code?: unknown
  helper?: unknown
  operation?: unknown
  functionPath?: unknown
  convexUrl?: unknown
  authMode?: unknown
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('fetch'))) return true
  return false
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getErrorInit(
  record: Record<string, unknown>,
): Omit<ConstructorParameters<typeof ConvexCallError>[1] & object, 'cause' | 'code' | 'status'> {
  return {
    helper: asString(record.helper),
    operation: asString(record.operation),
    functionPath: asString(record.functionPath),
    convexUrl: asString(record.convexUrl),
    authMode: asString(record.authMode),
  }
}

function parseMessageForCode(message: string): { message: string; code?: string } {
  const markerIndex = message.indexOf(LIMIT_ERROR_MARKER)
  if (markerIndex < 0) return { message }

  const tail = message.slice(markerIndex)
  const separatorIndex = tail.indexOf(':')
  if (separatorIndex <= 0) return { message }

  const code = tail.slice(0, separatorIndex).trim()
  if (!code.startsWith(LIMIT_ERROR_MARKER)) return { message }

  const normalizedMessage = tail.slice(separatorIndex + 1).trim()
  if (!normalizedMessage) return { message, code }

  return { message: normalizedMessage, code }
}

function extractIssues(data: Record<string, unknown>): ConvexErrorIssue[] | undefined {
  const raw = data.issues ?? data.errors ?? data.fieldErrors
  if (!Array.isArray(raw)) return undefined
  const mapped = raw
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map(i => ({
      path: asString(i.path ?? i.field),
      message: asString(i.message) ?? 'Unknown error',
      code: asString(i.code),
    }))
  return mapped.length > 0 ? mapped : undefined
}

function fromStructuredData(
  data: Record<string, unknown>,
): { message: string; code?: string; status?: number; issues?: ConvexErrorIssue[] } | null {
  const dataMessage = asString(data.message)
  const dataCode = asString(data.code) ?? asString(data.errorCode)
  const dataStatus = asNumber(data.status)

  if (!dataMessage && !dataCode && dataStatus === undefined) return null

  const parsed = dataMessage ? parseMessageForCode(dataMessage) : { message: 'Convex call failed' }
  return {
    message: parsed.message,
    code: dataCode ?? parsed.code,
    status: dataStatus,
    issues: extractIssues(data),
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Normalize an unknown thrown value into a `ConvexCallError` instance.
 *
 * Handles: native Errors, plain objects, strings, and nested Convex error shapes.
 * The original value is preserved as `cause` for debugging.
 */
export function toConvexError(error: unknown): ConvexCallError {
  const fallbackMessage = 'Unknown Convex error'

  if (error instanceof ConvexCallError) return error

  if (error instanceof Error) {
    const record = error as Error & ConvexErrorLike
    const init = getErrorInit(record as unknown as Record<string, unknown>)
    const structured = asRecord(record.data)
    if (structured) {
      const fromData = fromStructuredData(structured)
      if (fromData) {
        return new ConvexCallError(fromData.message, {
          ...init,
          code: fromData.code,
          status: fromData.status ?? asNumber(record.status),
          issues: fromData.issues,
          cause: record,
        })
      }
    }
    const message = asString(record.message) ?? fallbackMessage
    const parsed = parseMessageForCode(message)
    return new ConvexCallError(parsed.message, {
      ...init,
      code: asString(record.code) ?? parsed.code,
      status: asNumber(record.status),
      category: isNetworkError(error) ? 'network' : undefined,
      cause: record,
    })
  }

  const record = asRecord(error)
  if (record) {
    const init = getErrorInit(record)
    const structured = asRecord(record.data)
    if (structured) {
      const fromData = fromStructuredData(structured)
      if (fromData) {
        return new ConvexCallError(fromData.message, {
          ...init,
          code: fromData.code,
          status: fromData.status ?? asNumber(record.status),
          issues: fromData.issues,
          cause: error,
        })
      }
    }
    const message = asString(record.message) ?? fallbackMessage
    const parsed = parseMessageForCode(message)
    return new ConvexCallError(parsed.message, {
      ...init,
      code: asString(record.code) ?? parsed.code,
      status: asNumber(record.status),
      cause: error,
    })
  }

  const message = typeof error === 'string' && error.length > 0 ? error : fallbackMessage
  const parsed = parseMessageForCode(message)
  return new ConvexCallError(parsed.message, {
    code: parsed.code,
    category: isNetworkError(error) ? 'network' : undefined,
    cause: error,
  })
}
