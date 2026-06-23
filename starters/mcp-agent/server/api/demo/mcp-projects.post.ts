import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createError, getRequestURL, readValidatedBody } from 'h3'
import { z } from 'zod'

const requestSchema = z.object({
  bearerToken: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1)
})

function extractMcpTextContent(result: Awaited<ReturnType<Client['callTool']>>) {
  const content = Array.isArray(result.content) ? result.content : []
  return content
    .filter((item): item is { type: 'text'; text: string } => {
      return typeof item === 'object' && item !== null && item.type === 'text'
    })
    .map((item) => item.text)
}

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (value) => requestSchema.parse(value))
  const origin = getRequestURL(event).origin
  const client = new Client({
    name: 'mcp-agent-starter-demo',
    version: '0.1.0'
  })

  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', origin), {
        requestInit: {
          headers: {
            authorization: `Bearer ${body.bearerToken}`
          }
        }
      })
    )

    const result = await client.callTool({
      name: 'projects.create',
      arguments: {
        organizationId: body.organizationId,
        name: body.name
      }
    })

    const content = extractMcpTextContent(result)
    if (result.isError) {
      throw createError({
        statusCode: 400,
        statusMessage: content[0] ?? 'MCP tool call failed'
      })
    }

    return { content }
  } finally {
    await client.close()
  }
})
