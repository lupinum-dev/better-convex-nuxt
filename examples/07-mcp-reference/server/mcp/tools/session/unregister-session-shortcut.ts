import { createError } from 'h3'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'

import { useMcpServer, useMcpSession } from '#trellis/mcp'
import { defineMcpTool } from '#trellis/mcp/advanced'
interface ReferenceSessionData {
  preferredFocus?: string
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
  description: 'Remove a previously registered session-local tool.',
  enabled: (event) => !!event.context.mcpAuth,
  inputSchema: {
    name: z.string().describe('Shortcut name to remove'),
  },
  handler: async ({ name }) => {
    if (!useEvent().context.mcpAuth) {
      throw createError({ statusCode: 403, message: 'Authentication required.' })
    }

    const shortcutName = normalizeShortcutName(name)
    const mcp = useMcpServer()
    const session = useMcpSession<ReferenceSessionData>()
    const registeredShortcuts = (await session.get('registeredShortcuts')) ?? []

    const removed = mcp.removeTool(shortcutName)
    await session.set(
      'registeredShortcuts',
      registeredShortcuts.filter((value) => value !== shortcutName),
    )

    return {
      content: [
        {
          type: 'text',
          text: removed
            ? `Removed "${shortcutName}".`
            : `No session tool named "${shortcutName}" was registered.`,
        },
      ],
      structuredContent: { removed, name: shortcutName },
    }
  },
})
