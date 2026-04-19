import { z } from 'zod'
import { useEvent } from 'nitropack/runtime'

import { defineMcpTool, useMcpServer, useMcpSession } from '#trellis/mcp'

interface InternalHarnessSessionData {
  preferredSearch?: string
  registeredShortcuts?: string[]
}

function normalizeShortcutName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized ? `session-shortcut-${normalized}` : 'session-shortcut-default'
}

export default defineMcpTool({
  name: 'register-session-shortcut',
  description: 'Register a session-local MCP tool that returns a canned text response.',
  enabled: (event) => !!event.context.mcpAuth,
  inputSchema: {
    name: z.string().describe('Requested shortcut name; it will be normalized to a safe tool name'),
    message: z.string().describe('Text the dynamic tool should return when called'),
  },
  handler: async ({ name, message }) => {
    if (!useEvent().context.mcpAuth) {
      throw createError({ statusCode: 403, message: 'Authentication required.' })
    }

    const shortcutName = normalizeShortcutName(name)
    const mcp = useMcpServer()
    const session = useMcpSession<InternalHarnessSessionData>()
    const registeredShortcuts = (await session.get('registeredShortcuts')) ?? []

    mcp.registerTool(
      shortcutName,
      {
        description: `Session-local shortcut that returns "${message}"`,
      },
      async () => {
        return {
          content: [{ type: 'text', text: message }],
          structuredContent: {
            ok: true,
            message,
          },
        }
      },
    )

    if (!registeredShortcuts.includes(shortcutName)) {
      await session.set('registeredShortcuts', [...registeredShortcuts, shortcutName])
    }

    return {
      content: [{ type: 'text', text: `Registered session tool "${shortcutName}".` }],
      structuredContent: {
        name: shortcutName,
        message,
      },
    }
  },
})
