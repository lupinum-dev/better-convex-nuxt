import { defineMcpRuntime } from '@lupinum/trellis/mcp'
import { serverConvexAction, serverConvexMutation, serverConvexQuery } from '@lupinum/trellis/server'

import type { MiniCmsPrincipal } from '~/shared/principal'
import { getCapabilitiesForPrincipal, getMcpPrincipal, type CapabilitySnapshot } from './mcp-auth'

export const mcpRuntime = defineMcpRuntime<MiniCmsPrincipal, CapabilitySnapshot>({
  callConvex: async (event) => ({
    query: async (fn, args) => await serverConvexQuery(event, fn, args, { auth: 'none' }),
    mutation: async (fn, args) => await serverConvexMutation(event, fn, args, { auth: 'none' }),
    action: async (fn, args) => await serverConvexAction(event, fn, args, { auth: 'none' }),
  }),
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
