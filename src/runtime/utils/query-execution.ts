import { ConvexError } from 'convex/values'

import { ConvexCallError } from '../errors'
import { parseConvexResponse } from './convex-shared'

interface RecordLike {
  [key: string]: unknown
}

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === 'object' ? (value as RecordLike) : null
}

/**
 * Execute a query over HTTP on server or client without WebSocket state.
 *
 * This is a library-owned HTTP boundary (architecture invariant), so it constructs the
 * `transport` classification itself while it still knows the source: a `$fetch`
 * rejection (network failure, timeout, non-2xx) becomes a `transport`
 * {@link ConvexCallError}. A Convex application error carried in the 200-response
 * envelope is re-thrown so it normalizes downstream: with structured `errorData`
 * it is a `server` error (data preserved verbatim); without, it stays `unknown`.
 * The composable normalizes exactly once at its own boundary.
 *
 * @internal
 */
export async function executeQueryHttp<T>(
  convexUrl: string,
  functionPath: string,
  args: Record<string, unknown>,
  authToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  let response: unknown
  try {
    response = await $fetch(`${convexUrl}/api/query`, {
      method: 'POST',
      headers,
      body: { path: functionPath, args: args ?? {} },
    })
  } catch (error) {
    const status = asFetchStatus(error)
    throw new ConvexCallError({
      kind: 'transport',
      message: 'The request to Convex failed before a usable response was received.',
      status,
      cause: error,
    })
  }

  // A Convex function that threw surfaces as a 200 envelope with status:'error'.
  // Preserve structured errorData as `server` data; leave unstructured failures
  // to normalize as `unknown` (parity with the WebSocket path).
  const record = asRecord(response)
  if (record && record.status === 'error') {
    if ('errorData' in record) {
      throw new ConvexError(record.errorData as string)
    }
    const message = (record.errorMessage || record.message || 'Query failed') as string
    throw new Error(message)
  }

  return parseConvexResponse<T>(response)
}

function asFetchStatus(error: unknown): number | undefined {
  const record = asRecord(error)
  if (!record) return undefined
  const status = record.statusCode ?? record.status
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined
}
