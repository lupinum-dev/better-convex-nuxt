import type { H3Event } from 'h3'
import { getHeader } from 'h3'

import { api } from '#trellis/api'
import { defineMcpApp } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import type { KanbanPrincipal } from '~/convex/auth/principal'

function getAgentPrincipal(event: H3Event): KanbanPrincipal {
  const userId = getHeader(event, 'x-kanban-user')?.trim()
  if (!userId) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'agent',
    userId,
    agentId: 'local-kanban-agent',
    provider: 'mcp',
  }
}

export const mcpApp = defineMcpApp({
  callConvex: async (event, principal) => createServerConvexCaller(event, { principal }),
  resolvePrincipal: async (event) => getAgentPrincipal(event),
  resolveCapabilities: async ({ principal, convex }) => {
    if (principal.kind !== 'agent') {
      return {
        archiveBoard: false,
      }
    }

    const board = await convex.query(api.boards.getCurrentBoard, {})

    return {
      archiveBoard: board?.permissions.archiveBoard === true,
    }
  },
  principalKey: (principal) =>
    principal.kind === 'agent' ? `agent:${principal.agentId}:${principal.userId}` : principal.kind,
})

export const tool = mcpApp.tool
