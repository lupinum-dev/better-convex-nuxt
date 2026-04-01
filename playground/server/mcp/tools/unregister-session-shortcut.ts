import { createError } from 'h3'

import { defineMcpTool, useMcpServer, useMcpSession } from '#convex/mcp'
import { z } from 'zod'

interface PlaygroundSessionData {
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
  name: 'unregister-session-shortcut',
  description: 'Remove a session-local MCP tool registered earlier in the same session.',
  auth: 'required',
  inputSchema: {
    name: z.string().describe('The shortcut name used during registration'),
  },
  handler: async ({ name }) => {
    const shortcutName = normalizeShortcutName(name)
    const mcp = useMcpServer()
    const session = useMcpSession<PlaygroundSessionData>()
    const removed = mcp.removeTool(shortcutName)

    if (!removed) {
      throw createError({ statusCode: 404, message: `Session tool "${shortcutName}" not found.` })
    }

    const registeredShortcuts = await session.get('registeredShortcuts') ?? []
    await session.set(
      'registeredShortcuts',
      registeredShortcuts.filter(entry => entry !== shortcutName),
    )

    return {
      content: [{ type: 'text', text: `Removed session tool "${shortcutName}".` }],
      structuredContent: {
        name: shortcutName,
        removed: true,
      },
    }
  },
})
