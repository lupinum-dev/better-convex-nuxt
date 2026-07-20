import { describe, expect, it } from 'vitest'

import {
  MCP_MAX_BODY_BYTES,
  MCP_PROTOCOL_VERSION,
  MCP_TOOLS,
  parseMcpRequest,
  readMcpRequest,
} from '../../starters/mcp-oauth-agent/convex/mcp/protocol'

describe('closed MCP protocol surface', () => {
  it('supports the pinned initialize and complete fixed tool list', () => {
    expect(
      parseMcpRequest({
        id: 1,
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: { name: 'fixture', version: '1' },
          protocolVersion: MCP_PROTOCOL_VERSION,
        },
      }),
    ).toEqual({ id: 1, kind: 'initialize' })
    expect(MCP_TOOLS.map(({ name, requiredScope }) => [name, requiredScope])).toEqual([
      ['projects.list', 'mcp:read'],
      ['projects.create', 'mcp:write'],
      ['projects.delete.preview', 'mcp:write'],
      ['projects.delete.requestApproval', 'mcp:write'],
      ['projects.delete.execute', 'mcp:write'],
    ])
  })

  it('maps only an exact tool name and bounded argument schema', () => {
    expect(
      parseMcpRequest({
        id: 'call-1',
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          arguments: { name: 'Example', organizationId: 'org-1' },
          name: 'projects.create',
        },
      }),
    ).toEqual({
      arguments: { name: 'Example', organizationId: 'org-1' },
      id: 'call-1',
      kind: 'tools/call',
      name: 'projects.create',
      requiredScope: 'mcp:write',
    })

    for (const params of [
      { arguments: { organizationId: 'org-1' }, name: 'convex.call' },
      {
        arguments: { function: 'admin.deleteEverything', organizationId: 'org-1' },
        name: 'projects.list',
      },
      {
        arguments: { authorization: 'Bearer secret', organizationId: 'org-1' },
        name: 'projects.list',
      },
      {
        arguments: { organizationId: 'org-1', token: 'secret' },
        name: 'projects.list',
      },
    ]) {
      expect(() =>
        parseMcpRequest({
          id: 1,
          jsonrpc: '2.0',
          method: 'tools/call',
          params,
        }),
      ).toThrowError(expect.objectContaining({ code: -32602 }))
    }
  })

  it('rejects batches, unknown methods, extra request keys, and malformed notifications', () => {
    for (const request of [
      [],
      [{ id: 1, jsonrpc: '2.0', method: 'ping' }],
      { id: 1, jsonrpc: '2.0', method: 'resources/list' },
      { id: 1, jsonrpc: '2.0', method: 'ping', upstream: 'https://evil.test' },
      { id: 1, jsonrpc: '2.0', method: 'notifications/initialized' },
    ]) {
      expect(() => parseMcpRequest(request)).toThrow()
    }
  })

  it('bounds wire bodies and rejects encoded/non-JSON content', async () => {
    const valid = new Request('https://app.example.test/mcp', {
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'ping' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    await expect(readMcpRequest(valid)).resolves.toEqual({ id: 1, kind: 'ping' })

    const oversized = new Request('https://app.example.test/mcp', {
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'ping',
        padding: 'x'.repeat(MCP_MAX_BODY_BYTES),
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    await expect(readMcpRequest(oversized)).rejects.toMatchObject({ code: -32600 })

    for (const headers of [
      new Headers({ 'content-type': 'text/plain' }),
      new Headers({ 'content-encoding': 'gzip', 'content-type': 'application/json' }),
    ]) {
      await expect(
        readMcpRequest(
          new Request('https://app.example.test/mcp', {
            body: '{}',
            headers,
            method: 'POST',
          }),
        ),
      ).rejects.toMatchObject({ code: -32600 })
    }
  })
})
