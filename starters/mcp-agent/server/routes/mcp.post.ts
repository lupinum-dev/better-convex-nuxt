import { ConvexHttpClient } from 'convex/browser'
import { createError, defineEventHandler, getHeader, readBody, setResponseStatus } from 'h3'

import { createMcpHandlers, hashBearerSecret, parseBearerToken } from '../mcp/tools'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{
    id?: string | number
    method?: string
    params?: Record<string, unknown>
  }>(event)

  const token = parseBearerToken(getHeader(event, 'authorization'))
  const credentialHash = hashBearerSecret(token)
  const convexUrl = config.public.convex?.url
  if (typeof convexUrl !== 'string' || !convexUrl) {
    throw createError({ statusCode: 500, statusMessage: 'NUXT_PUBLIC_CONVEX_URL is required' })
  }

  const client = new ConvexHttpClient(convexUrl)
  const handlers = createMcpHandlers(client, credentialHash)

  try {
    if (body.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          protocolVersion: '2025-11-25',
          serverInfo: { name: 'better-convex-nuxt-mcp-agent', version: '0.1.0' },
          capabilities: { tools: {} }
        }
      }
    }

    if (body.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: body.id,
        result: handlers.listTools()
      }
    }

    if (body.method === 'tools/call') {
      const name = body.params?.name
      const args = body.params?.arguments ?? {}
      if (typeof name !== 'string') {
        throw createError({ statusCode: 400, statusMessage: 'Tool name is required' })
      }

      return {
        jsonrpc: '2.0',
        id: body.id,
        result: await handlers.callTool(name, args)
      }
    }

    throw createError({ statusCode: 404, statusMessage: `Unknown method: ${body.method}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MCP request failed'
    setResponseStatus(event, 400)
    return {
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32000,
        message
      }
    }
  }
})
