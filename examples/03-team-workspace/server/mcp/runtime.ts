import type { H3Event } from 'h3'

import { api } from '#trellis/api'
import { defineMcpApp } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import { todoCreate, todoRead, type TeamWorkspacePermissionKey } from '~/convex/auth/permissions'
import type { TeamTodoPrincipal } from '~/convex/auth/principal'

type McpAuthContext = {
  userId?: string
}

type CapabilitySnapshot = Record<TeamWorkspacePermissionKey, boolean>

function getMcpPrincipal(event: H3Event): TeamTodoPrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.userId) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'agent',
    userId: auth.userId,
    provider: 'mcp',
  }
}

export const mcpRuntime = defineMcpApp<TeamTodoPrincipal, CapabilitySnapshot>({
  callConvex: async (event, principal) =>
    createServerConvexCaller(
      event,
      principal.kind === 'agent'
        ? {
            auth: 'trusted',
            actor: { userId: principal.userId },
            principal,
          }
        : { auth: 'none' },
    ),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveCapabilities: async ({ principal, convex }) => {
    if (principal.kind !== 'agent') {
      return {
        [todoRead.key]: false,
        [todoCreate.key]: false,
      }
    }

    const permissions = await convex.query(api.permissions.context.getPermissionContext, {})

    return permissions?.can ?? { [todoRead.key]: false, [todoCreate.key]: false }
  },
  principalKey: (principal) =>
    principal.kind === 'agent' ? `agent:${principal.agentId ?? principal.userId}` : principal.kind,
})

export const tool = mcpRuntime.tool
