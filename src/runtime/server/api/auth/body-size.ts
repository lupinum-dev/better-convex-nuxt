import { CONVEX_MODULE_DEFAULTS } from '../../../utils/config-defaults'

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

async function readStreamWithLimit(
  stream: ReadableStream<unknown> | null | undefined,
  maxBytes: number,
  createSizeError: (observedBytes: number, maxBytes: number) => ProxyBodySizeErrorShape,
): Promise<Uint8Array | undefined> {
  if (!stream) return undefined

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = chunkToUint8Array(value)
      totalBytes += chunk.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {})
        throw createSizeError(totalBytes, maxBytes)
      }
      chunks.push(chunk)
    }
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
  stream: ReadableStream<unknown> | null | undefined,
  maxBytes: number = DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES,
): Promise<string | undefined> {
  const body = await readStreamWithLimit(stream, maxBytes, createRequestBodySizeError)
  if (!body || body.byteLength === 0) return undefined
  return new TextDecoder().decode(body)
}

export async function readResponseBodyWithLimit(
  response: Response,
  maxBytes: number = DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES,
): Promise<Uint8Array> {
  return (
    (await readStreamWithLimit(response.body, maxBytes, createResponseBodySizeError)) ??
    new Uint8Array()
  )
}
