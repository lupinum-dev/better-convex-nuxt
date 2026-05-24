export interface BootstrapResponse {
  organizationId: string
  users: Record<'admin' | 'member' | 'viewer' | 'noOrg', { id: string; authKey: string }>
  resources: {
    noteId: string
    postId: string
  }
  keys: Record<'admin' | 'member' | 'viewer' | 'noOrg' | 'revoked', { id: string; key: string }>
}

export interface McpStateResponse {
  keys: Array<{
    _id: string
    key: string
    status: string
    lastUsedAt?: number
  }>
  confirmations: Array<{
    _id: string
    jti: string
    operationId: string
    callerKey: string
    scopeKey: string
    redeemedAt: number
  }>
  audit: Array<{
    _id: string
    operationId: string
    jti: string
    callerKey: string
    scopeKey: string
    argsHash: string
    previewHash: string
    executedAt: number
    executePath: string
  }>
}

export async function fetchMcpBootstrap(
  fetchAny: (request: string, options?: Record<string, unknown>) => Promise<unknown>,
): Promise<BootstrapResponse> {
  return (await fetchAny('/api/test-mcp-bootstrap', {
    method: 'POST',
  })) as BootstrapResponse
}

export async function fetchMcpState(
  fetchAny: (request: string, options?: Record<string, unknown>) => Promise<unknown>,
): Promise<McpStateResponse> {
  return (await fetchAny('/api/test-mcp-state')) as McpStateResponse
}
