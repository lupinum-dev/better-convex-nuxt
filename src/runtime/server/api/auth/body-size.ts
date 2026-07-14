import type { H3Event } from 'h3'
import { getRequestWebStream } from 'h3'

import { CONVEX_MODULE_DEFAULTS } from '../../../utils/config-defaults'

const H3_RAW_BODY = Symbol.for('h3RawBody')

export const DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES =
  CONVEX_MODULE_DEFAULTS.authProxy.maxRequestBodyBytes
export const DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES =
  CONVEX_MODULE_DEFAULTS.authProxy.maxResponseBodyBytes

export interface ProxyBodySizeErrorShape {
  statusCode: 413 | 502
  code: 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE' | 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE'
  message: string
  contentLengthBytes: number
  maxBytes: number
}

class ProxyBodySizeLimitError extends Error implements ProxyBodySizeErrorShape {
  readonly statusCode: 413 | 502
  readonly code: ProxyBodySizeErrorShape['code']
  readonly contentLengthBytes: number
  readonly maxBytes: number
  readonly data: {
    code: ProxyBodySizeErrorShape['code']
    contentLengthBytes: number
    maxBytes: number
  }

  constructor(shape: ProxyBodySizeErrorShape) {
    super(shape.message)
    this.name = 'ProxyBodySizeLimitError'
    this.statusCode = shape.statusCode
    this.code = shape.code
    this.contentLengthBytes = shape.contentLengthBytes
    this.maxBytes = shape.maxBytes
    this.data = {
      code: shape.code,
      contentLengthBytes: shape.contentLengthBytes,
      maxBytes: shape.maxBytes,
    }
  }
}

function parseContentLengthBytes(contentLengthHeader: string | null): number | null {
  if (!contentLengthHeader) return null
  const parsed = Number(contentLengthHeader)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.trunc(parsed)
}

export function getRequestBodySizeError(
  contentLengthHeader: string | null,
  maxBytes: number = DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES,
): ProxyBodySizeErrorShape | null {
  const contentLengthBytes = parseContentLengthBytes(contentLengthHeader)
  if (contentLengthBytes === null || contentLengthBytes <= maxBytes) {
    return null
  }
  return {
    statusCode: 413,
    code: 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE',
    message: `Auth proxy request body too large (${contentLengthBytes} bytes). Maximum allowed is ${maxBytes} bytes.`,
    contentLengthBytes,
    maxBytes,
  }
}

export function getResponseBodySizeError(
  contentLengthHeader: string | null,
  maxBytes: number = DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES,
): ProxyBodySizeErrorShape | null {
  const contentLengthBytes = parseContentLengthBytes(contentLengthHeader)
  if (contentLengthBytes === null || contentLengthBytes <= maxBytes) {
    return null
  }
  return {
    statusCode: 502,
    code: 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE',
    message: `Auth proxy upstream response body too large (${contentLengthBytes} bytes). Maximum allowed is ${maxBytes} bytes.`,
    contentLengthBytes,
    maxBytes,
  }
}

function createRequestBodySizeError(
  observedBytes: number,
  maxBytes: number,
): ProxyBodySizeErrorShape {
  return new ProxyBodySizeLimitError({
    statusCode: 413,
    code: 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE',
    message: `Auth proxy request body too large (${observedBytes} bytes read). Maximum allowed is ${maxBytes} bytes.`,
    contentLengthBytes: observedBytes,
    maxBytes,
  })
}

function createResponseBodySizeError(
  observedBytes: number,
  maxBytes: number,
): ProxyBodySizeErrorShape {
  return new ProxyBodySizeLimitError({
    statusCode: 502,
    code: 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE',
    message: `Auth proxy upstream response body too large (${observedBytes} bytes read). Maximum allowed is ${maxBytes} bytes.`,
    contentLengthBytes: observedBytes,
    maxBytes,
  })
}

function chunkToUint8Array(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  if (typeof chunk === 'string') return new TextEncoder().encode(chunk)
  throw new TypeError('[better-convex-nuxt] Auth proxy body stream yielded an unsupported chunk.')
}

async function readNextChunk(
  reader: ReadableStreamDefaultReader<unknown>,
  signal?: AbortSignal,
): Promise<ReadableStreamReadResult<unknown>> {
  if (!signal) return await reader.read()
  if (signal.aborted) throw signal.reason
  return await new Promise((resolve, reject) => {
    const abort = () => {
      reject(signal.reason ?? new Error('Auth proxy body read was aborted'))
    }
    signal.addEventListener('abort', abort, { once: true })
    reader
      .read()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  })
}

function cancelReader(reader: ReadableStreamDefaultReader<unknown>, reason: unknown): void {
  try {
    void reader.cancel(reason).catch(() => {})
  } catch {
    // A failed cancellation still leaves no other safe cleanup operation.
  }
}

function createNodeRequestBodyStream(event: H3Event): ReadableStream<Uint8Array> {
  const request = event.node.req
  let cancel: () => void = () => {
    request.pause()
  }

  return new ReadableStream({
    start(controller) {
      let settled = false
      const cleanup = () => {
        request.off('data', onData)
        request.off('end', onEnd)
        request.off('error', onError)
        request.off('aborted', onAborted)
        request.off('close', onClose)
      }
      const finish = () => {
        if (settled) return
        settled = true
        cleanup()
        controller.close()
      }
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        controller.error(error)
      }
      const onData = (value: unknown) => {
        try {
          controller.enqueue(chunkToUint8Array(value))
        } catch (error) {
          fail(error)
        }
      }
      const onEnd = () => finish()
      const onError = (error: Error) => fail(error)
      const onAborted = () => fail(new Error('Auth proxy client disconnected during upload'))
      const onClose = () => {
        if (!request.complete) onAborted()
      }

      cancel = () => {
        if (settled) return
        settled = true
        cleanup()
        // The route answers with `Connection: close`, so pausing bounds work
        // without destroying the socket before Nitro can send the error.
        request.pause()
      }

      if (request.readableEnded) {
        finish()
        return
      }
      request.on('data', onData)
      request.once('end', onEnd)
      request.once('error', onError)
      request.once('aborted', onAborted)
      request.once('close', onClose)
    },
    cancel() {
      cancel()
    },
  })
}

async function readStreamWithLimit(
  stream: ReadableStream<unknown> | null | undefined,
  maxBytes: number,
  createSizeError: (observedBytes: number, maxBytes: number) => ProxyBodySizeErrorShape,
  signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
  if (!stream) return undefined

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await readNextChunk(reader, signal)
      if (done) break

      const chunk = chunkToUint8Array(value)
      totalBytes += chunk.byteLength
      if (totalBytes > maxBytes) {
        throw createSizeError(totalBytes, maxBytes)
      }
      chunks.push(chunk)
    }
  } catch (error) {
    cancelReader(reader, error)
    throw error
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function readRequestBodyWithLimit(
  event: H3Event,
  maxBytes: number = DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES,
  signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
  const webBody = event.web?.request?.body
  if (webBody) {
    return await readStreamWithLimit(webBody, maxBytes, createRequestBodySizeError, signal)
  }

  const request = event.node.req as H3Event['node']['req'] & Record<PropertyKey, unknown>
  const hasH3Body =
    Boolean(event._requestBody) ||
    H3_RAW_BODY in request ||
    'rawBody' in request ||
    'body' in request ||
    '__unenv__' in request
  if (hasH3Body) {
    return await readStreamWithLimit(
      getRequestWebStream(event),
      maxBytes,
      createRequestBodySizeError,
      signal,
    )
  }

  // H3 1.15's Node request WebStream does not detach its anonymous IncomingMessage
  // listeners when cancelled. Read the real Node stream directly so a deadline or
  // limit can remove this handler's listeners before Nitro writes the error response.
  if (request.socket) {
    return await readStreamWithLimit(
      createNodeRequestBodyStream(event),
      maxBytes,
      createRequestBodySizeError,
      signal,
    )
  }

  return await readStreamWithLimit(
    getRequestWebStream(event),
    maxBytes,
    createRequestBodySizeError,
    signal,
  )
}

export async function readResponseBodyWithLimit(
  response: Response,
  maxBytes: number = DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return (
    (await readStreamWithLimit(response.body, maxBytes, createResponseBodySizeError, signal)) ??
    new Uint8Array()
  )
}

export function cancelResponseBody(response: Response | undefined, reason: unknown): void {
  const body = response?.body
  if (!body || body.locked) return

  try {
    void body.cancel(reason).catch(() => {})
  } catch {
    // Cancellation is best effort once the upstream stream itself has failed.
  }
}
