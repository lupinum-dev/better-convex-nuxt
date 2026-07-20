import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('vNext MCP SDK transport laboratory', () => {
  it('uses the official SDK for discovery, a structured tool call, and a resource read', async () => {
    const server = new McpServer({ name: 'better-convex-vnext-lab', version: '0.0.0' })
    const client = new Client({ name: 'better-convex-vnext-lab-client', version: '0.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    server.registerTool(
      'search_notes',
      {
        description: 'Search neutral notes in the topology laboratory.',
        inputSchema: z.object({ query: z.string().min(1) }),
        outputSchema: z.object({ matches: z.array(z.string()) }),
      },
      async ({ query }) => {
        const output = { matches: query === 'alpha' ? ['note-alpha'] : [] }
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        }
      },
    )

    server.registerResource(
      'note-alpha',
      'note://note-alpha',
      { description: 'A neutral note resource.', mimeType: 'application/json' },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ id: 'note-alpha', title: 'Alpha' }),
          },
        ],
      }),
    )

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

      const listed = await client.listTools()
      expect(listed.tools.map((tool) => tool.name)).toContain('search_notes')

      const called = await client.callTool({
        name: 'search_notes',
        arguments: { query: 'alpha' },
      })
      expect(called.structuredContent).toEqual({ matches: ['note-alpha'] })

      const resource = await client.readResource({ uri: 'note://note-alpha' })
      expect(resource.contents).toEqual([
        {
          uri: 'note://note-alpha',
          mimeType: 'application/json',
          text: JSON.stringify({ id: 'note-alpha', title: 'Alpha' }),
        },
      ])
    } finally {
      await client.close()
      await server.close()
    }
  })
})
