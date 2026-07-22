import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { runMcpTool } from '../../packages/mcp/src/tools'

describe('MCP tool failure projection', () => {
  it('preserves expected values and explicit safe actionable failures', async () => {
    const expected = await runMcpTool(() => ({
      content: [{ type: 'text', text: 'Entry changed; refresh before retrying.' }],
      structuredContent: { status: 'conflict' },
    }))
    expect(expected).toEqual({
      content: [{ type: 'text', text: 'Entry changed; refresh before retrying.' }],
      structuredContent: { status: 'conflict' },
    })

    const actionable = await runMcpTool(() => ({
      content: [{ type: 'text', text: 'Upstream is temporarily unavailable.' }],
      isError: true,
    }))
    expect(actionable).toEqual({
      content: [{ type: 'text', text: 'Upstream is temporarily unavailable.' }],
      isError: true,
    })
  })

  it.each([
    new Error('raw-upstream-response-sentinel'),
    { authorization: 'Bearer raw-token-sentinel', stack: 'private-stack-sentinel' },
    'plain-throw-sentinel',
  ])('replaces unexpected throw with one static failure', async (cause) => {
    const result = await runMcpTool(() => {
      throw cause
    })
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Tool execution failed' }],
      isError: true,
    })
    const serialized = JSON.stringify(result)
    for (const sentinel of [
      'raw-upstream-response-sentinel',
      'raw-token-sentinel',
      'private-stack-sentinel',
      'plain-throw-sentinel',
    ]) {
      expect(serialized).not.toContain(sentinel)
    }
    expect(result).not.toHaveProperty('cause')
  })

  it('keeps cross-tenant denial indistinguishable and contains unknown throws through the SDK', async () => {
    const server = new McpServer({ name: 'tool-error-proof', version: '0.1.0' })
    server.registerTool(
      'read_note',
      { inputSchema: z.object({ mode: z.enum(['denied', 'missing', 'unknown']) }).strict() },
      ({ mode }) =>
        runMcpTool(() => {
          if (mode === 'unknown') throw new Error('database-record-sentinel')
          return {
            content: [{ type: 'text', text: 'Note not found' }],
            structuredContent: { status: 'not_found' },
          }
        }),
    )
    const client = new Client({ name: 'tool-error-client', version: '0.1.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const denied = await client.callTool({ name: 'read_note', arguments: { mode: 'denied' } })
      const missing = await client.callTool({ name: 'read_note', arguments: { mode: 'missing' } })
      expect(denied).toEqual(missing)

      const unknown = await client.callTool({ name: 'read_note', arguments: { mode: 'unknown' } })
      expect(unknown).toMatchObject({
        content: [{ type: 'text', text: 'Tool execution failed' }],
        isError: true,
      })
      expect(JSON.stringify(unknown)).not.toContain('database-record-sentinel')
    } finally {
      await client.close()
      await server.close()
    }
  })
})
