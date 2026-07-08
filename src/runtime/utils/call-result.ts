export interface ConvexCallError {
  message: string
  code?: string
  status?: number
  cause?: unknown
}

export type CallResult<T, E = ConvexCallError> = { ok: true; data: T } | { ok: false; error: E }

interface ConvexErrorLike {
  data?: unknown
  message?: unknown
  status?: unknown
  code?: unknown
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

function fromStructuredData(data: Record<string, unknown>): ConvexCallError | null {
  const dataMessage = asString(data.message)
  const dataCode = asString(data.code) ?? asString(data.errorCode)
  const dataStatus = asNumber(data.status)

  if (!dataMessage && !dataCode && dataStatus === undefined) {
    return null
  }

  return {
    message: dataMessage ?? 'Convex call failed',
    code: dataCode,
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
    const structured = asRecord(record.data)
    if (structured) {
      const fromData = fromStructuredData(structured)
      if (fromData) {
        return {
          ...fromData,
          status: fromData.status ?? asNumber(record.status),
          cause: record,
        }
      }
    }

    return {
      message: asString(record.message) ?? fallbackMessage,
      code: asString(record.code),
      status: asNumber(record.status),
      cause: record,
    }
  }

  const record = asRecord(error)
  if (record) {
    const structured = asRecord(record.data)
    if (structured) {
      const fromData = fromStructuredData(structured)
      if (fromData) {
        return {
          ...fromData,
          status: fromData.status ?? asNumber(record.status),
          cause: error,
        }
      }
    }

    return {
      message: asString(record.message) ?? fallbackMessage,
      code: asString(record.code),
      status: asNumber(record.status),
      cause: error,
    }
  }

  return {
    message: typeof error === 'string' && error.length > 0 ? error : fallbackMessage,
    cause: error,
  }
}

export function toError(error: ConvexCallError): Error {
  const err = new Error(error.message)
  ;(err as Error & ConvexErrorLike).code = error.code
  ;(err as Error & ConvexErrorLike).status = error.status
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
