import { createError, getRequestWebStream, type H3Event } from 'h3'

export const DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES = 1_048_576 // 1 MiB
export const DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES = 1_048_576 // 1 MiB

interface ProxyBodySizeErrorShape {
  statusCode: 413 | 502
  code: 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE' | 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE'
  message: string
  contentLengthBytes: number
  maxBytes: number
}

function parseContentLengthBytes(contentLengthHeader: string | null): number | null {
  if (!contentLengthHeader) return null
  const parsed = Number(contentLengthHeader)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.trunc(parsed)
}

function createBodySizeError(
  statusCode: 413 | 502,
  code: ProxyBodySizeErrorShape['code'],
  contentLengthBytes: number,
  maxBytes: number,
): Error & ProxyBodySizeErrorShape {
  const err = createError({
    statusCode,
    message:
      statusCode === 413
        ? `Auth proxy request body too large (${contentLengthBytes} bytes). Maximum allowed is ${maxBytes} bytes.`
        : `Auth proxy upstream response body too large (${contentLengthBytes} bytes). Maximum allowed is ${maxBytes} bytes.`,
    data: {
      code,
      contentLengthBytes,
      maxBytes,
    },
  })
  return Object.assign(err, { code, contentLengthBytes, maxBytes }) as Error &
    ProxyBodySizeErrorShape
}

function toUint8Array(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  }
  return new Uint8Array(0)
}

async function readLimitedStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  maxBytes: number,
  onExceeded: (contentLengthBytes: number) => Error & ProxyBodySizeErrorShape,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0)

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue

      const chunk = toUint8Array(value)
      totalBytes += chunk.byteLength
      if (totalBytes > maxBytes) {
        throw onExceeded(totalBytes)
      }
      chunks.push(chunk)
    }
  } catch (error) {
    try {
      await reader.cancel(error)
    } catch {
      // Ignore secondary cancellation errors.
    }
    throw error
  } finally {
    reader.releaseLock()
  }

  if (chunks.length === 0) return new Uint8Array(0)
  if (chunks.length === 1) return chunks[0]

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
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

export async function readRequestBodyWithLimit(
  event: H3Event,
  maxBytes: number = DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES,
): Promise<string | undefined> {
  const bodyStream = getRequestWebStream(event)
  const bodyBytes = await readLimitedStream(bodyStream, maxBytes, (contentLengthBytes) =>
    createBodySizeError(413, 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE', contentLengthBytes, maxBytes),
  )

  if (bodyBytes.byteLength === 0) return undefined
  return new TextDecoder('utf-8').decode(bodyBytes)
}

export async function readResponseBodyWithLimit(
  response: Response,
  maxBytes: number = DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES,
): Promise<Uint8Array> {
  return await readLimitedStream(response.body, maxBytes, (contentLengthBytes) =>
    createBodySizeError(
      502,
      'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE',
      contentLengthBytes,
      maxBytes,
    ),
  )
}
