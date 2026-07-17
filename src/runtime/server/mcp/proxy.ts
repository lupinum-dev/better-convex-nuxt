import { MCP_RESOURCE_PATH, type McpTopology } from './topology'

export const MCP_MAX_REQUEST_BODY_BYTES = 64 * 1024
export const MCP_MAX_RESPONSE_BODY_BYTES = 1024 * 1024
export const MCP_PROXY_TIMEOUT_MS = 30_000
export const MCP_SSE_PROXY_TIMEOUT_MS = 300_000

const ALLOWED_METHODS = new Set(['DELETE', 'GET', 'POST'])
const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'last-event-id',
  'mcp-protocol-version',
  'mcp-session-id',
] as const
const RESPONSE_HEADERS = [
  'allow',
  'cache-control',
  'content-type',
  'mcp-protocol-version',
  'mcp-session-id',
  'retry-after',
  'vary',
  'www-authenticate',
] as const

export class McpProxyError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string) {
    super(code)
    this.name = 'McpProxyError'
    this.status = status
    this.code = code
  }
}

function errorResponse(error: McpProxyError): Response {
  return Response.json(
    { code: error.code },
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
      status: error.status,
    },
  )
}

function parseContentLength(value: string | null): number | null {
  if (value === null) return null
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new McpProxyError(400, 'BCN_MCP_LENGTH_INVALID')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new McpProxyError(400, 'BCN_MCP_LENGTH_INVALID')
  return parsed
}

async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  declaredLength: number | null,
  maxBytes: number,
): Promise<Uint8Array | undefined> {
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new McpProxyError(413, 'BCN_MCP_REQUEST_BODY_TOO_LARGE')
  }
  if (!body) return undefined

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new McpProxyError(413, 'BCN_MCP_REQUEST_BODY_TOO_LARGE')
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}

function isJsonContentType(value: string | null): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

function isEventStream(value: string | null): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'text/event-stream'
}

function copyBody(bytes: Uint8Array | undefined): ArrayBuffer | undefined {
  if (bytes === undefined) return undefined
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function buildMcpProxyRequestHeaders(input: Headers): Headers {
  const output = new Headers()
  for (const name of REQUEST_HEADERS) {
    const value = input.get(name)
    if (value !== null) output.set(name, value)
  }
  return output
}

export function buildMcpProxyResponseHeaders(input: Headers): Headers {
  const output = new Headers()
  for (const name of RESPONSE_HEADERS) {
    const value = input.get(name)
    if (value !== null) output.set(name, value)
  }
  return output
}

export interface ProxyMcpRequestOptions {
  fetch?: typeof globalThis.fetch
  request: Request
  topology: Pick<McpTopology, 'actionUrl'>
}

/**
 * Forward one public MCP request to the configured Convex action. The raw
 * Authorization value is copied as an opaque header and is never parsed.
 */
export async function proxyMcpRequest({
  fetch = globalThis.fetch,
  request,
  topology,
}: ProxyMcpRequestOptions): Promise<Response> {
  try {
    const incomingUrl = new URL(request.url)
    if (incomingUrl.pathname !== MCP_RESOURCE_PATH || incomingUrl.search || incomingUrl.hash) {
      throw new McpProxyError(404, 'BCN_MCP_ROUTE_NOT_FOUND')
    }
    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response(null, { headers: { allow: 'GET, POST, DELETE' }, status: 405 })
    }
    if (request.headers.has('content-encoding')) {
      throw new McpProxyError(415, 'BCN_MCP_CONTENT_ENCODING_UNSUPPORTED')
    }

    const declaredLength = parseContentLength(request.headers.get('content-length'))
    let body: Uint8Array | undefined
    if (request.method === 'POST') {
      if (!isJsonContentType(request.headers.get('content-type'))) {
        throw new McpProxyError(415, 'BCN_MCP_CONTENT_TYPE_UNSUPPORTED')
      }
      body = await readBodyWithLimit(request.body, declaredLength, MCP_MAX_REQUEST_BODY_BYTES)
    } else if ((declaredLength ?? 0) !== 0 || request.body !== null) {
      throw new McpProxyError(400, 'BCN_MCP_BODY_FORBIDDEN')
    }

    const timeout = request.method === 'GET' ? MCP_SSE_PROXY_TIMEOUT_MS : MCP_PROXY_TIMEOUT_MS
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeout)])
    const upstream = await fetch(topology.actionUrl, {
      body: copyBody(body),
      headers: buildMcpProxyRequestHeaders(request.headers),
      method: request.method,
      redirect: 'manual',
      signal,
    })

    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel().catch(() => {})
      throw new McpProxyError(502, 'BCN_MCP_UPSTREAM_REDIRECT_REJECTED')
    }

    const headers = buildMcpProxyResponseHeaders(upstream.headers)
    if (isEventStream(headers.get('content-type'))) {
      return new Response(upstream.body, { headers, status: upstream.status })
    }

    let declaredResponseLength: number | null
    try {
      declaredResponseLength = parseContentLength(upstream.headers.get('content-length'))
    } catch (error) {
      await upstream.body?.cancel().catch(() => {})
      if (error instanceof McpProxyError) {
        throw new McpProxyError(502, 'BCN_MCP_UPSTREAM_LENGTH_INVALID')
      }
      throw error
    }
    if (declaredResponseLength !== null && declaredResponseLength > MCP_MAX_RESPONSE_BODY_BYTES) {
      await upstream.body?.cancel().catch(() => {})
      throw new McpProxyError(502, 'BCN_MCP_UPSTREAM_BODY_TOO_LARGE')
    }
    const responseBody = await readBodyWithLimit(
      upstream.body,
      declaredResponseLength,
      MCP_MAX_RESPONSE_BODY_BYTES,
    ).catch((error: unknown) => {
      if (error instanceof McpProxyError && error.status === 413) {
        throw new McpProxyError(502, 'BCN_MCP_UPSTREAM_BODY_TOO_LARGE')
      }
      throw error
    })
    return new Response(copyBody(responseBody), { headers, status: upstream.status })
  } catch (error) {
    if (error instanceof McpProxyError) return errorResponse(error)
    if (error instanceof Error && error.name === 'TimeoutError') {
      return errorResponse(new McpProxyError(504, 'BCN_MCP_UPSTREAM_TIMEOUT'))
    }
    return errorResponse(new McpProxyError(502, 'BCN_MCP_UPSTREAM_UNREACHABLE'))
  }
}
