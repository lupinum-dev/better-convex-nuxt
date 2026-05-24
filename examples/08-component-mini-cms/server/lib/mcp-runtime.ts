import { defineMcpApp } from '@lupinum/trellis/mcp'
import { createServerConvexCaller } from '@lupinum/trellis/server'

import type { MiniCmsPrincipal } from '../../shared/caller'
import { getCapabilitiesForPrincipal, getMcpCaller, type RecordAccessSnapshot } from './mcp-auth'

export const mcpRuntime = defineMcpApp<MiniCmsPrincipal, RecordAccessSnapshot>({
  callConvex: async (event, { caller }) =>
    createServerConvexCaller(
      event,
      caller.kind === 'anonymous'
        ? { auth: 'none' }
        : caller.kind === 'user'
          ? {
              auth: 'trusted',
              caller,
            }
          : {
              auth: 'trusted',
              caller,
            },
    ),
  resolveCaller: async (event) => getMcpCaller(event),
  resolveAccess: async ({ caller }) => getCapabilitiesForPrincipal(caller),
  callerKey: (caller) => {
    switch (caller.kind) {
      case 'anonymous':
        return 'anonymous'
      case 'user':
        return `auth:${caller.authKey}`
      case 'agent':
        return `agent:${caller.agentId}`
    }

    throw new Error('Unsupported MCP caller.')
  },
  scopeKey: () => 'global',
})

export const tool = mcpRuntime.tool
