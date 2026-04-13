import { defineMcpRuntime } from '@lupinum/trellis/mcp'
import { createServerConvexCaller } from '@lupinum/trellis/server'

import type { MiniCmsPrincipal } from '~/shared/principal'

import { getCapabilitiesForPrincipal, getMcpPrincipal, type CapabilitySnapshot } from './mcp-auth'

export const mcpRuntime = defineMcpRuntime<MiniCmsPrincipal, CapabilitySnapshot>({
  callConvex: async (event) => createServerConvexCaller(event),
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

export const projectTool = mcpRuntime.projectTool
