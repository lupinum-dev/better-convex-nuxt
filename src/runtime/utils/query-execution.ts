import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'

import { ConvexCallError } from '../errors'

export const SSR_QUERY_TIMEOUT_MS = 8_000
export const SSR_QUERY_MAX_RESPONSE_BYTES = 1024 * 1024
const CONVEX_UDF_FAILED_STATUS = 560
const SSR_QUERY_UPSTREAM_FAILURE_MESSAGE =
  'The request to Convex failed before a usable response was received.'

interface SsrQueryFetchOptions {
  fetchImpl?: typeof fetch
  maxResponseBytes?: number
  signal?: AbortSignal
  timeoutMs?: number
}

function transportError(message: string, status?: number): ConvexCallError {
  return new ConvexCallError({ kind: 'transport', message, status })
}

function boundedResponse(
  response: Response,
  maximum: number,
  signal: AbortSignal,
  cleanup: () => void,
): Response {
  const declared = response.headers.get('content-length')
  if (declared !== null) {
    const length = Number(declared)
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum) {
      cleanup()
      void response.body?.cancel().catch(() => {})
      throw transportError('Convex HTTP response exceeded the size limit', response.status)
    }
  }
  if (!response.body) {
    cleanup()
    return response
  }

  const reader = response.body.getReader()
  let total = 0
  let finished = false
  let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined
  const abortBody = () => {
    if (finished) return
    const reason =
      signal.reason instanceof ConvexCallError
        ? signal.reason
        : transportError('Convex HTTP request was aborted')
    void reader.cancel(reason).catch(() => {})
    finish()
    bodyController?.error(reason)
  }
  const finish = () => {
    if (finished) return
    finished = true
    signal.removeEventListener('abort', abortBody)
    cleanup()
    reader.releaseLock()
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      bodyController = controller
      signal.addEventListener('abort', abortBody, { once: true })
      if (signal.aborted) abortBody()
    },
    async pull(controller) {
      try {
        const next = await reader.read()
        if (next.done) {
          finish()
          controller.close()
          return
        }
        total += next.value.byteLength
        if (total > maximum) {
          const error = transportError(
            'Convex HTTP response exceeded the size limit',
            response.status,
          )
          await reader.cancel(error)
          finish()
          controller.error(error)
          return
        }
        controller.enqueue(next.value)
      } catch (error) {
        finish()
        controller.error(error)
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } finally {
        finish()
      }
    },
  })
  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export function createSsrConvexFetch(options: SsrQueryFetchOptions = {}): typeof fetch {
  const {
    fetchImpl = fetch,
    maxResponseBytes = SSR_QUERY_MAX_RESPONSE_BYTES,
    signal: parentSignal,
    timeoutMs = SSR_QUERY_TIMEOUT_MS,
  } = options
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new TypeError('SSR_QUERY_RESPONSE_LIMIT_INVALID')
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('SSR_QUERY_TIMEOUT_INVALID')
  }

  return async (input, init) => {
    const controller = new AbortController()
    const abortFromParent = () => controller.abort(parentSignal?.reason)
    if (parentSignal?.aborted) abortFromParent()
    else parentSignal?.addEventListener('abort', abortFromParent, { once: true })
    const timeout = setTimeout(
      () => controller.abort(transportError('Convex HTTP request timed out')),
      timeoutMs,
    )
    const cleanup = () => {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abortFromParent)
    }

    try {
      const response = await fetchImpl(input, {
        ...init,
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!response.ok && response.status !== CONVEX_UDF_FAILED_STATUS) {
        cleanup()
        void response.body?.cancel().catch(() => {})
        throw transportError(SSR_QUERY_UPSTREAM_FAILURE_MESSAGE, response.status)
      }
      return boundedResponse(response, maxResponseBytes, controller.signal, cleanup)
    } catch (error) {
      cleanup()
      if (error instanceof ConvexCallError) throw error
      if (controller.signal.aborted) {
        throw transportError(
          parentSignal?.aborted
            ? 'Convex HTTP request was aborted'
            : 'Convex HTTP request timed out',
        )
      }
      throw transportError('Convex HTTP request could not complete')
    }
  }
}

/**
 * Execute one request-scoped SSR query through Convex's official HTTP client.
 * The client owns Convex value encoding, response decoding, and structured
 * application-error reconstruction. The custom fetch owns only request bounds.
 *
 * @internal
 */
export async function executeQueryHttp<T>(
  convexUrl: string,
  functionPath: string,
  args: Record<string, unknown>,
  authToken?: string,
  signal?: AbortSignal,
): Promise<T> {
  const client = new ConvexHttpClient(convexUrl, {
    fetch: createSsrConvexFetch({ signal }),
    logger: false,
  })
  if (authToken) client.setAuth(authToken)

  try {
    return (await client.query(
      makeFunctionReference<'query', Record<string, unknown>, T>(functionPath),
      args,
    )) as T
  } catch (error) {
    if (error instanceof ConvexCallError || error instanceof ConvexError) throw error
    throw new ConvexCallError({
      kind: 'unknown',
      message: 'Convex server call failed',
    })
  }
}
