export const maximumMcpRequestBytes = 64 * 1024
export const maximumMcpResponseBytes = 1024 * 1024
export const mcpRequestTimeoutMs = 30_000

export class McpTransportFailure extends Error {
  readonly status: 400 | 413 | 502 | 504

  constructor(status: McpTransportFailure['status']) {
    super('MCP transport request failed')
    this.name = 'McpTransportFailure'
    this.status = status
  }
}

export async function prepareBoundedMcpRequest(
  request: Request,
  signal: AbortSignal,
): Promise<Request> {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null) {
    const bytes = Number(declaredLength)
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new McpTransportFailure(400)
    if (bytes > maximumMcpRequestBytes) throw new McpTransportFailure(413)
  }
  if (request.body === null) return new Request(request, { signal })

  const body = await readBoundedBody(request.body, maximumMcpRequestBytes, 413, signal)
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  return new Request(request, { body, headers, signal })
}

export async function boundMcpResponse(response: Response): Promise<Response> {
  if (response.body === null || isEventStream(response.headers.get('content-type'))) return response
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const bytes = Number(declaredLength)
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new McpTransportFailure(502)
    if (bytes > maximumMcpResponseBytes) throw new McpTransportFailure(502)
  }
  const body = await readBoundedBody(response.body, maximumMcpResponseBytes, 502)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(hasNoResponseBody(response.status) ? null : body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export async function runMcpRequestDeadline(
  requestSignal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
  if (requestSignal.aborted) throw requestSignal.reason
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort(requestSignal.reason)
  requestSignal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new McpTransportFailure(504))
  }, mcpRequestTimeoutMs)

  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<Response>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
          once: true,
        })
      }),
    ])
  } catch (error) {
    if (timedOut) throw new McpTransportFailure(504)
    throw error
  } finally {
    clearTimeout(timer)
    requestSignal.removeEventListener('abort', abort)
  }
}

export function mcpTransportFailureResponse(error: McpTransportFailure): Response {
  return new Response(null, {
    headers: { 'cache-control': 'no-store' },
    status: error.status,
  })
}

async function readBoundedBody(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
  failureStatus: 413 | 502,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const cancel = () => void reader.cancel(signal?.reason).catch(() => undefined)
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason
      const { done, value } = await reader.read()
      if (signal?.aborted) throw signal.reason
      if (done) break
      total += value.byteLength
      if (total > maximumBytes) {
        await reader.cancel()
        throw new McpTransportFailure(failureStatus)
      }
      chunks.push(value)
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
    reader.releaseLock()
  }

  const buffer = new ArrayBuffer(total)
  const body = new Uint8Array(buffer)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer
}

function isEventStream(value: string | null): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'text/event-stream'
}

function hasNoResponseBody(status: number): boolean {
  return status === 204 || status === 205 || status === 304
}
