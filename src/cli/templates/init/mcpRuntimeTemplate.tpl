import { api } from '#trellis/api'
import { defineMcpApp } from '@lupinum/trellis/mcp'
import { createServerConvexCaller } from '@lupinum/trellis/server'
import type { H3Event } from 'h3'

import { todoCreate, workspaceRead } from '~~/convex/features/todos'
import type { WorkspacePrincipal } from '~~/convex/auth/principal'

type McpAuthContext = {
  id?: string
  userId?: string
}

function getMcpPrincipal(event: H3Event): WorkspacePrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.id || !auth.userId) {
    return { kind: 'anonymous', subject: 'system:anonymous' }
  }

  return {
    kind: 'agent',
    agentId: auth.id,
    subject: `agent:${auth.id}`,
    provider: 'mcp',
  }
}

export const mcpRuntime = defineMcpApp<WorkspacePrincipal>({
  callConvex: async (event, { principal, delegation }) =>
    createServerConvexCaller(
      event,
      principal.kind === 'agent'
        ? {
            auth: 'trusted',
            principal,
            delegation,
          }
        : { auth: 'none' },
    ),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveCapabilities: async ({ principal, convex }) =>
    principal.kind === 'agent'
      ? ((await convex.query(api.permissions.context.getPermissionContext, {}))?.can ?? {
          [workspaceRead.key]: false,
          [todoCreate.key]: false,
        })
      : {
          [workspaceRead.key]: false,
          [todoCreate.key]: false,
        },
  principalKey: (principal) =>
    principal.kind === 'agent' ? `agent:${principal.agentId}` : principal.kind,
})

// Project root refs for tool files.
export const tool = mcpRuntime.tool
export default mcpRuntime
