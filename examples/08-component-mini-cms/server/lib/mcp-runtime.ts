import { defineMcpApp } from '@lupinum/trellis/mcp'
import { createServerConvexCaller } from '@lupinum/trellis/server'

import type { MiniCmsPrincipal } from '~/shared/principal'

import { getCapabilitiesForPrincipal, getMcpPrincipal, type CapabilitySnapshot } from './mcp-auth'

export const mcpRuntime = defineMcpApp<MiniCmsPrincipal, CapabilitySnapshot>({
  callConvex: async (event, principal) =>
    createServerConvexCaller(
      event,
      principal.kind === 'anonymous'
        ? { auth: 'none' }
        : principal.kind === 'user'
          ? {
              auth: 'trusted',
              actor: { userId: principal.userId },
              principal,
            }
          : {
              auth: 'trusted',
              actor: { userId: `agent:${principal.agentId}` },
              principal,
            },
    ),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveCapabilities: async ({ principal }) => getCapabilitiesForPrincipal(principal),
  principalKey: (principal) => {
    switch (principal.kind) {
      case 'anonymous':
        return 'anonymous'
      case 'user':
        return `user:${principal.userId}`
      case 'agent':
        return `agent:${principal.agentId}`
    }
  },
})

export const tool = mcpRuntime.tool
