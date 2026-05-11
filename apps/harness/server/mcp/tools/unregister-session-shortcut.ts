import { createError } from 'h3'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'

import { useMcpServer, useMcpSession } from '#trellis/mcp'
import { defineMcpTool } from '#trellis/mcp/advanced'

import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'

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
  name: 'unregister-session-shortcut',
  description: 'Remove a session-local MCP tool registered earlier in the same session.',
  enabled: async (event) => !!(await resolveHarnessMcpAuth(event)),
  inputSchema: {
    name: z.string().describe('The shortcut name used during registration'),
  },
  handler: async ({ name }) => {
    if (!(await resolveHarnessMcpAuth(useEvent()))) {
      throw createError({ statusCode: 403, message: 'Authentication required.' })
    }

    const shortcutName = normalizeShortcutName(name)
    const mcp = useMcpServer()
    const session = useMcpSession<InternalHarnessSessionData>()
    const removed = mcp.removeTool(shortcutName)

    if (!removed) {
      throw createError({ statusCode: 404, message: `Session tool "${shortcutName}" not found.` })
    }

    const registeredShortcuts = (await session.get('registeredShortcuts')) ?? []
    await session.set(
      'registeredShortcuts',
      registeredShortcuts.filter((entry) => entry !== shortcutName),
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
