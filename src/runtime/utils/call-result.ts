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
 *   if (e instanceof ConvexError) {
 *     console.log(e.code, e.status)
 *   }
 * }
 * ```
 */
// Internal class name avoids esbuild naming conflict with convex/values ConvexError
class BcnError extends Error {
  /** Type brand for instanceof checks without importing the class. */
  readonly isConvexError = true as const

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
    },
  ) {
    super(message, init?.cause !== undefined ? { cause: init.cause } : undefined)
    this.name = 'ConvexError'
    if (init) {
      this.code = init.code
      this.status = init.status
      this.helper = init.helper
      this.operation = init.operation
      this.functionPath = init.functionPath
      this.convexUrl = init.convexUrl
      this.authMode = init.authMode
    }
  }
}

/**
 * Public name for BcnError. The internal class is named BcnError to avoid
 * a bundler naming conflict with convex/values which also exports ConvexError.
 */
export { BcnError as ConvexError }

export type CallResult<T, E = BcnError> = { ok: true; data: T } | { ok: false; error: E }

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
): Omit<ConstructorParameters<typeof BcnError>[1] & object, 'cause' | 'code' | 'status'> {
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

function fromStructuredData(
  data: Record<string, unknown>,
): { message: string; code?: string; status?: number } | null {
  const dataMessage = asString(data.message)
  const dataCode = asString(data.code) ?? asString(data.errorCode)
  const dataStatus = asNumber(data.status)

  if (!dataMessage && !dataCode && dataStatus === undefined) return null

  const parsed = dataMessage ? parseMessageForCode(dataMessage) : { message: 'Convex call failed' }
  return {
    message: parsed.message,
    code: dataCode ?? parsed.code,
    status: dataStatus,
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Normalize an unknown thrown value into a `ConvexError` instance.
 *
 * Handles: native Errors, plain objects, strings, and nested Convex error shapes.
 * The original value is preserved as `cause` for debugging.
 */
export function toConvexError(error: unknown): BcnError {
  const fallbackMessage = 'Unknown Convex error'

  if (error instanceof BcnError) return error

  if (error instanceof Error) {
    const record = error as Error & ConvexErrorLike
    const init = getErrorInit(record as unknown as Record<string, unknown>)
    const structured = asRecord(record.data)
    if (structured) {
      const fromData = fromStructuredData(structured)
      if (fromData) {
        return new BcnError(fromData.message, {
          ...init,
          code: fromData.code,
          status: fromData.status ?? asNumber(record.status),
          cause: record,
        })
      }
    }
    const message = asString(record.message) ?? fallbackMessage
    const parsed = parseMessageForCode(message)
    return new BcnError(parsed.message, {
      ...init,
      code: asString(record.code) ?? parsed.code,
      status: asNumber(record.status),
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
        return new BcnError(fromData.message, {
          ...init,
          code: fromData.code,
          status: fromData.status ?? asNumber(record.status),
          cause: error,
        })
      }
    }
    const message = asString(record.message) ?? fallbackMessage
    const parsed = parseMessageForCode(message)
    return new BcnError(parsed.message, {
      ...init,
      code: asString(record.code) ?? parsed.code,
      status: asNumber(record.status),
      cause: error,
    })
  }

  const message = typeof error === 'string' && error.length > 0 ? error : fallbackMessage
  const parsed = parseMessageForCode(message)
  return new BcnError(parsed.message, { code: parsed.code, cause: error })
}

/**
 * Wrap a promise-returning function in a `CallResult` envelope.
 * Returns `{ ok: true, data }` on success, `{ ok: false, error: ConvexError }` on failure.
 *
 * @example
 * ```ts
 * const result = await toCallResult(() => execute(args))
 * if (result.ok) {
 *   console.log(result.data)
 * } else {
 *   console.error(result.error.message)
 * }
 * ```
 */
export async function toCallResult<T>(call: () => Promise<T>): Promise<CallResult<T>> {
  try {
    const data = await call()
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: toConvexError(error) }
  }
}
