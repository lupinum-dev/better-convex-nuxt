import type { McpScope } from './policy'

export const MCP_PROTOCOL_VERSION = '2025-11-25'
export const MCP_MAX_BODY_BYTES = 64 * 1024

export const MCP_TOOLS = Object.freeze([
  {
    description: 'List up to 100 active projects in an organization.',
    inputSchema: {
      additionalProperties: false,
      properties: { organizationId: { type: 'string' } },
      required: ['organizationId'],
      type: 'object',
    },
    name: 'projects.list',
    requiredScope: 'mcp:read',
  },
  {
    description: 'Create one project after live member authorization.',
    inputSchema: {
      additionalProperties: false,
      properties: { name: { maxLength: 100, type: 'string' }, organizationId: { type: 'string' } },
      required: ['organizationId', 'name'],
      type: 'object',
    },
    name: 'projects.create',
    requiredScope: 'mcp:write',
  },
  {
    description: 'Preview a reversible project deletion without changing state.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        organizationId: { type: 'string' },
        projectId: { type: 'string' },
      },
      required: ['organizationId', 'projectId'],
      type: 'object',
    },
    name: 'projects.delete.preview',
    requiredScope: 'mcp:write',
  },
  {
    description: 'Request a short-lived human approval for one project deletion.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        organizationId: { type: 'string' },
        projectId: { type: 'string' },
      },
      required: ['organizationId', 'projectId'],
      type: 'object',
    },
    name: 'projects.delete.requestApproval',
    requiredScope: 'mcp:write',
  },
  {
    description: 'Soft-delete one project using its bound, approved request.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        approvalId: { type: 'string' },
        organizationId: { type: 'string' },
        projectId: { type: 'string' },
      },
      required: ['organizationId', 'projectId', 'approvalId'],
      type: 'object',
    },
    name: 'projects.delete.execute',
    requiredScope: 'mcp:write',
  },
] as const satisfies readonly {
  description: string
  inputSchema: Record<string, unknown>
  name: string
  requiredScope: McpScope
}[])

export type McpToolName = (typeof MCP_TOOLS)[number]['name']

export type ParsedMcpRequest =
  | { id: string | number; kind: 'initialize' }
  | { id: string | number; kind: 'ping' }
  | { kind: 'initialized' }
  | { id: string | number; kind: 'tools/list' }
  | {
      arguments: Record<string, string>
      id: string | number
      kind: 'tools/call'
      name: McpToolName
      requiredScope: McpScope
    }

export class McpProtocolError extends Error {
  readonly code: -32700 | -32600 | -32601 | -32602
  readonly id: string | number | null

  constructor(code: McpProtocolError['code'], id: string | number | null = null) {
    super('MCP_PROTOCOL_ERROR')
    this.name = 'McpProtocolError'
    this.code = code
    this.id = id
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed)
  return Object.keys(value).every((key) => set.has(key))
}

function requestId(value: unknown): string | number {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
    throw new McpProtocolError(-32600)
  }
  return value
}

function requiredIdArgument(args: Record<string, unknown>, field: string): string {
  const value = args[field]
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new McpProtocolError(-32602)
  }
  return value
}

function parseToolCall(id: string | number, params: unknown): ParsedMcpRequest {
  if (!record(params) || !exactKeys(params, ['name', 'arguments'])) {
    throw new McpProtocolError(-32602, id)
  }
  const tool = MCP_TOOLS.find(({ name }) => name === params.name)
  if (!tool || !record(params.arguments)) throw new McpProtocolError(-32602, id)
  const args = params.arguments
  const allowed =
    tool.name === 'projects.create'
      ? ['organizationId', 'name']
      : tool.name === 'projects.delete.execute'
        ? ['approvalId', 'organizationId', 'projectId']
        : tool.name === 'projects.list'
          ? ['organizationId']
          : ['organizationId', 'projectId']
  if (!exactKeys(args, allowed) || Object.keys(args).length !== allowed.length) {
    throw new McpProtocolError(-32602, id)
  }

  const parsed: Record<string, string> = {
    organizationId: requiredIdArgument(args, 'organizationId'),
  }
  if (allowed.includes('projectId')) parsed.projectId = requiredIdArgument(args, 'projectId')
  if (allowed.includes('approvalId')) parsed.approvalId = requiredIdArgument(args, 'approvalId')
  if (allowed.includes('name')) {
    const name = args.name
    if (typeof name !== 'string' || !name.trim() || name.length > 100) {
      throw new McpProtocolError(-32602, id)
    }
    parsed.name = name
  }
  return {
    arguments: parsed,
    id,
    kind: 'tools/call',
    name: tool.name,
    requiredScope: tool.requiredScope,
  }
}

export function parseMcpRequest(value: unknown): ParsedMcpRequest {
  if (!record(value) || !exactKeys(value, ['jsonrpc', 'id', 'method', 'params'])) {
    throw new McpProtocolError(-32600)
  }
  if (value.jsonrpc !== '2.0' || typeof value.method !== 'string') {
    throw new McpProtocolError(-32600)
  }
  if (value.method === 'notifications/initialized') {
    if ('id' in value || (value.params !== undefined && !record(value.params))) {
      throw new McpProtocolError(-32600)
    }
    return { kind: 'initialized' }
  }

  const id = requestId(value.id)
  if (value.method === 'initialize') {
    if (
      !record(value.params) ||
      typeof value.params.protocolVersion !== 'string' ||
      !record(value.params.clientInfo) ||
      !record(value.params.capabilities)
    ) {
      throw new McpProtocolError(-32602, id)
    }
    return { id, kind: 'initialize' }
  }
  if (value.method === 'ping') return { id, kind: 'ping' }
  if (value.method === 'tools/list') {
    if (
      value.params !== undefined &&
      (!record(value.params) || Object.keys(value.params).length > 0)
    ) {
      throw new McpProtocolError(-32602, id)
    }
    return { id, kind: 'tools/list' }
  }
  if (value.method === 'tools/call') return parseToolCall(id, value.params)
  throw new McpProtocolError(-32601, id)
}

function contentLength(headers: Headers): number | null {
  const value = headers.get('content-length')
  if (value === null) return null
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new McpProtocolError(-32600)
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result > MCP_MAX_BODY_BYTES) {
    throw new McpProtocolError(-32600)
  }
  return result
}

export async function readMcpRequest(request: Request): Promise<ParsedMcpRequest> {
  const type = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (type !== 'application/json' || request.headers.has('content-encoding')) {
    throw new McpProtocolError(-32600)
  }
  contentLength(request.headers)
  if (!request.body) throw new McpProtocolError(-32700)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > MCP_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {})
        throw new McpProtocolError(-32600)
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return parseMcpRequest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  } catch (error) {
    if (error instanceof McpProtocolError) throw error
    throw new McpProtocolError(-32700)
  }
}

export function jsonRpcResult(id: string | number, result: unknown): Response {
  return Response.json(
    { id, jsonrpc: '2.0', result },
    { headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } },
  )
}

export function jsonRpcError(error: McpProtocolError): Response {
  const messages = {
    [-32700]: 'Parse error',
    [-32600]: 'Invalid Request',
    [-32601]: 'Method not found',
    [-32602]: 'Invalid params',
  } as const
  return Response.json(
    { error: { code: error.code, message: messages[error.code] }, id: error.id, jsonrpc: '2.0' },
    { headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } },
  )
}
