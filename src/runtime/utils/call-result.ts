export interface ConvexCallError {
  message: string
  code?: string
  status?: number
  helper?: string
  operation?: string
  functionPath?: string
  convexUrl?: string
  authMode?: string
  cause?: unknown
}

export type CallResult<T, E = ConvexCallError> = { ok: true; data: T } | { ok: false; error: E }

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
  cause?: unknown
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

function getErrorMetadata(record: Record<string, unknown>): Omit<ConvexCallError, 'message' | 'code' | 'status' | 'cause'> {
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
  if (markerIndex < 0) {
    return { message }
  }

  const tail = message.slice(markerIndex)
  const separatorIndex = tail.indexOf(':')
  if (separatorIndex <= 0) {
    return { message }
  }

  const code = tail.slice(0, separatorIndex).trim()
  if (!code.startsWith(LIMIT_ERROR_MARKER)) {
    return { message }
  }

  const normalizedMessage = tail.slice(separatorIndex + 1).trim()
  if (!normalizedMessage) {
    return { message, code }
  }

  return { message: normalizedMessage, code }
}

function fromStructuredData(data: Record<string, unknown>): ConvexCallError | null {
  const dataMessage = asString(data.message)
  const dataCode = asString(data.code) ?? asString(data.errorCode)
  const dataStatus = asNumber(data.status)

  if (!dataMessage && !dataCode && dataStatus === undefined) {
    return null
  }

  const parsed = dataMessage ? parseMessageForCode(dataMessage) : { message: 'Convex call failed' }
  return {
    message: parsed.message,
    code: dataCode ?? parsed.code,
    status: dataStatus,
    cause: data,
  }
}

/**
 * Normalize unknown thrown values from Convex, fetch, or user code
 * into a stable, serializable error object.
 */
export function normalizeConvexError(error: unknown): ConvexCallError {
  const fallbackMessage = 'Unknown Convex error'

  if (error instanceof Error) {
    const record = error as Error & ConvexErrorLike
    const metadata = getErrorMetadata(record as unknown as Record<string, unknown>)
    const structured = asRecord(record.data)
    if (structured) {
      const fromData = fromStructuredData(structured)
      if (fromData) {
        return {
          ...metadata,
          ...fromData,
          status: fromData.status ?? asNumber(record.status),
          cause: record,
        }
      }
    }

    const message = asString(record.message) ?? fallbackMessage
    const parsed = parseMessageForCode(message)
    return {
      ...metadata,
      message: parsed.message,
      code: asString(record.code) ?? parsed.code,
      status: asNumber(record.status),
      cause: record,
    }
  }

  const record = asRecord(error)
  if (record) {
    const metadata = getErrorMetadata(record)
    const structured = asRecord(record.data)
    if (structured) {
      const fromData = fromStructuredData(structured)
      if (fromData) {
        return {
          ...metadata,
          ...fromData,
          status: fromData.status ?? asNumber(record.status),
          cause: error,
        }
      }
    }

    const message = asString(record.message) ?? fallbackMessage
    const parsed = parseMessageForCode(message)
    return {
      ...metadata,
      message: parsed.message,
      code: asString(record.code) ?? parsed.code,
      status: asNumber(record.status),
      cause: error,
    }
  }

  const message = typeof error === 'string' && error.length > 0 ? error : fallbackMessage
  const parsed = parseMessageForCode(message)
  return {
    message: parsed.message,
    code: parsed.code,
    cause: error,
  }
}

export function toError(error: ConvexCallError): Error {
  const err = new Error(error.message)
  ;(err as Error & ConvexErrorLike).code = error.code
  ;(err as Error & ConvexErrorLike).status = error.status
  ;(err as Error & ConvexErrorLike).helper = error.helper
  ;(err as Error & ConvexErrorLike).operation = error.operation
  ;(err as Error & ConvexErrorLike).functionPath = error.functionPath
  ;(err as Error & ConvexErrorLike).convexUrl = error.convexUrl
  ;(err as Error & ConvexErrorLike).authMode = error.authMode
  ;(err as Error & ConvexErrorLike).cause = error.cause
  return err
}

export async function toCallResult<T>(call: () => Promise<T>): Promise<CallResult<T>> {
  try {
    const data = await call()
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: normalizeConvexError(error) }
  }
}
