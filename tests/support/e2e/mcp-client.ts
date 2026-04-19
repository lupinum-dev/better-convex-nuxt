import { fetch as testFetch } from '@nuxt/test-utils/e2e'

export interface McpRpcResponse<T> {
  _data: T
  headers: Headers
  status: number
}

function parseSsePayload(text: string) {
  const match = text.match(/data:\s*(\{[\s\S]*\})/)
  if (!match?.[1]) {
    throw new Error(`Could not parse SSE payload: ${text}`)
  }

  return JSON.parse(match[1]) as unknown
}

export async function rpc<T>(
  body: Record<string, unknown>,
  options: { sessionId?: string; key?: string } = {},
): Promise<McpRpcResponse<T>> {
  const response = await testFetch('/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(options.sessionId ? { 'Mcp-Session-Id': options.sessionId } : {}),
      ...(options.key ? { Authorization: `Bearer ${options.key}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  const contentType = response.headers.get('content-type') ?? ''
  const data = contentType.includes('text/event-stream')
    ? parseSsePayload(text)
    : (JSON.parse(text) as unknown)

  return {
    _data: data as T,
    headers: response.headers,
    status: response.status,
  }
}

export async function initializeMcpSession(key?: string): Promise<string | undefined> {
  const response = await rpc<{ result?: { protocolVersion?: string } }>(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'vitest', version: '1.0.0' },
      },
    },
    { key },
  )

  return (
    response.headers.get('mcp-session-id') ?? response.headers.get('Mcp-Session-Id') ?? undefined
  )
}
