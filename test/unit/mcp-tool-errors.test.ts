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
    {
      authorization: 'Bearer raw-token-sentinel',
      stack: 'private-stack-sentinel',
    },
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

  it('emits only frozen allowlisted metadata and ignores a failing diagnostic sink', async () => {
    const diagnostics: unknown[] = []
    const cause = Object.assign(new Error('private-message-sentinel'), {
      authorization: 'Bearer private-token-sentinel',
      data: { tenant: 'private-tenant-sentinel' },
      providerReference: 'private-provider-reference-sentinel',
      stack: 'private-stack-sentinel',
    })
    const result = await runMcpTool(
      () => {
        throw cause
      },
      {
        operation: 'mutation',
        toolName: 'rename_note',
        functionName: 'notes:rename',
        onDiagnostic(diagnostic) {
          diagnostics.push(diagnostic)
          expect(Object.isFrozen(diagnostic)).toBe(true)
          throw new Error('diagnostic-sink-sentinel')
        },
      },
    )

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Tool execution failed' }],
      isError: true,
    })
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toEqual({
      callId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      causeConstructorName: 'Error',
      causeName: 'Error',
      classification: 'unknown',
      functionName: 'notes:rename',
      hasStructuredData: true,
      operation: 'mutation',
      outcome: 'failed',
      toolName: 'rename_note',
    })
    const serialized = JSON.stringify({ diagnostics, result })
    for (const sentinel of [
      'private-message-sentinel',
      'private-token-sentinel',
      'private-tenant-sentinel',
      'private-provider-reference-sentinel',
      'private-stack-sentinel',
      'diagnostic-sink-sentinel',
    ]) {
      expect(serialized).not.toContain(sentinel)
    }
  })

  it('awaits an asynchronous diagnostic sink without exposing its failure', async () => {
    let completed = false
    const result = await runMcpTool(
      () => {
        throw new Error('private-async-diagnostic-cause')
      },
      {
        operation: 'query',
        toolName: 'search_notes',
        async onDiagnostic() {
          await Promise.resolve()
          completed = true
          throw new Error('private-async-diagnostic-failure')
        },
      },
    )

    expect(completed).toBe(true)
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Tool execution failed' }],
      isError: true,
    })
    expect(JSON.stringify(result)).not.toContain('private-async-diagnostic')
  })

  it('does not invoke hostile cause getters while creating a diagnostic', async () => {
    let getters = 0
    const cause = Object.create(null) as Record<string, unknown>
    for (const key of ['name', 'message', 'stack', 'data', 'constructor']) {
      Object.defineProperty(cause, key, {
        get() {
          getters += 1
          throw new Error(`getter-${key}`)
        },
      })
    }
    const diagnostics: unknown[] = []
    await runMcpTool(
      () => {
        throw cause
      },
      {
        operation: 'action',
        toolName: 'generate_report',
        onDiagnostic(diagnostic) {
          diagnostics.push(diagnostic)
        },
      },
    )
    expect(getters).toBe(0)
    expect(diagnostics).toEqual([
      {
        callId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        causeConstructorName: null,
        causeName: null,
        classification: 'unknown',
        hasStructuredData: false,
        operation: 'action',
        outcome: 'failed',
        toolName: 'generate_report',
      },
    ])
  })

  it('keeps cross-tenant denial indistinguishable and contains unknown throws through the SDK', async () => {
    const server = new McpServer({
      name: 'tool-error-proof',
      version: '0.1.0',
    })
    server.registerTool(
      'read_note',
      {
        inputSchema: z.object({ mode: z.enum(['denied', 'missing', 'unknown']) }).strict(),
      },
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
      const denied = await client.callTool({
        name: 'read_note',
        arguments: { mode: 'denied' },
      })
      const missing = await client.callTool({
        name: 'read_note',
        arguments: { mode: 'missing' },
      })
      expect(denied).toEqual(missing)

      const unknown = await client.callTool({
        name: 'read_note',
        arguments: { mode: 'unknown' },
      })
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
