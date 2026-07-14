import type { H3Event } from 'h3'
import { createError, setHeaders } from 'h3'

const textEncoder = new TextEncoder()

function closeConnection(event: H3Event) {
  if (event.node.res.headersSent) return
  event.node.res.shouldKeepAlive = false
  setHeaders(event, { connection: 'close' })
}

function bodyTooLarge(event: H3Event, maxBytes: number) {
  closeConnection(event)
  return createError({
    statusCode: 413,
    statusMessage: `Request body exceeds ${maxBytes} bytes`,
  })
}

function asBytes(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  if (typeof chunk === 'string') return textEncoder.encode(chunk)
  throw createError({ statusCode: 400, statusMessage: 'Unsupported request body chunk' })
}

async function readWebStreamWithLimit(
  event: H3Event,
  stream: ReadableStream<unknown>,
  maxBytes: number,
) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = asBytes(value)
      totalBytes += chunk.byteLength
      if (totalBytes > maxBytes) throw bodyTooLarge(event, maxBytes)
      chunks.push(chunk)
    }
  } catch (error) {
    try {
      await reader.cancel(error)
    } catch {
      // The response still fails closed when the request stream cannot be cancelled.
    }
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

async function readNodeStreamWithLimit(event: H3Event, maxBytes: number) {
  const request = event.node.req

  return await new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    let settled = false

    const cleanup = () => {
      request.off('data', onData)
      request.off('end', onEnd)
      request.off('error', onError)
      request.off('aborted', onAborted)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      request.pause()
      reject(error)
    }
    const onData = (value: unknown) => {
      try {
        const chunk = asBytes(value)
        totalBytes += chunk.byteLength
        if (totalBytes > maxBytes) {
          fail(bodyTooLarge(event, maxBytes))
          return
        }
        chunks.push(chunk)
      } catch (error) {
        fail(error)
      }
    }
    const onEnd = () => {
      if (settled) return
      settled = true
      cleanup()
      const body = new Uint8Array(totalBytes)
      let offset = 0
      for (const chunk of chunks) {
        body.set(chunk, offset)
        offset += chunk.byteLength
      }
      resolve(body)
    }
    const onError = (error: Error) => fail(error)
    const onAborted = () => fail(createError({ statusCode: 400, statusMessage: 'Request aborted' }))

    request.on('data', onData)
    request.once('end', onEnd)
    request.once('error', onError)
    request.once('aborted', onAborted)
  })
}

export async function cacheRequestBodyWithLimit(event: H3Event, maxBytes: number) {
  const contentLength = event.headers.get('content-length')
  if (contentLength !== null) {
    const parsedLength = Number(contentLength)
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw bodyTooLarge(event, maxBytes)
    }
  }

  const existingBody = event._requestBody
  const webStream =
    existingBody instanceof ReadableStream
      ? existingBody
      : existingBody === undefined
        ? event.web?.request?.body
        : undefined
  const body = webStream
    ? await readWebStreamWithLimit(event, webStream, maxBytes)
    : existingBody !== undefined
      ? asBytes(await new Response(existingBody).arrayBuffer())
      : await readNodeStreamWithLimit(event, maxBytes)

  if (body.byteLength > maxBytes) throw bodyTooLarge(event, maxBytes)
  event._requestBody = new TextDecoder().decode(body)
}
