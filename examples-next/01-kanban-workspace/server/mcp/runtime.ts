import { defineMcpApp, type McpConvexCaller } from '@lupinum/trellis/mcp'
import { createServerConvexCaller } from '@lupinum/trellis/server'
import type { H3Event } from 'h3'

import { api } from '../../convex/_generated/api'
import { trellisObservability } from '../../observability.config'
import type { KanbanPrincipal } from '../../convex/auth/principal'
import {
  deriveKanbanCapabilities,
  type KanbanCapabilities,
  type KanbanCapabilityRole,
} from '../../shared/mcp-capabilities'

type McpAuthContext = {
  userId?: string
  agentId?: string
}

function getMcpPrincipal(event: H3Event): KanbanPrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.userId) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'agent',
    userId: auth.userId,
    provider: 'mcp',
    ...(auth.agentId ? { agentId: auth.agentId } : {}),
  }
}

export async function resolveKanbanCapabilities({
  principal,
  convex,
}: {
  principal: KanbanPrincipal
  convex: McpConvexCaller
}): Promise<KanbanCapabilities> {
  if (principal.kind !== 'agent') {
    return {
      listWorkspaces: false,
      listBoards: false,
      createCard: false,
      moveCard: false,
      archiveBoard: false,
    }
  }

  const workspaces = await convex.query(api.workspaces.listAccessibleWorkspaces, {})
  return deriveKanbanCapabilities(
    workspaces.map((workspace: { role: string }) => workspace.role as KanbanCapabilityRole),
  )
}

export const mcpRuntime = defineMcpApp<KanbanPrincipal, KanbanCapabilities>({
  callConvex: async (event, principal) => createServerConvexCaller(event, { principal }),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveCapabilities: async ({ principal, convex }) =>
    await resolveKanbanCapabilities({ principal, convex }),
  principalKey: (principal) =>
    principal.kind === 'agent'
      ? `agent:${principal.agentId ?? principal.userId}`
      : principal.kind,
  observability: trellisObservability,
})

export const tool = mcpRuntime.tool
export default mcpRuntime
