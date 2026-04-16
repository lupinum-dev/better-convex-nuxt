import type { H3Event } from 'h3'

import { api } from '#trellis/api'
import { defineMcpRuntime } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import type { McpReferencePrincipal } from '~/convex/auth/principal'

import { mcpReferencePermissionKeys } from '../../shared/permissions'

type McpAuthContext = {
  keyId?: string
  userId?: string
}

function getMcpPrincipal(event: H3Event): McpReferencePrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.keyId || !auth.userId) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'agent',
    agentId: auth.keyId,
    userId: auth.userId,
    provider: 'mcp',
  }
}

export const mcpRuntime = defineMcpRuntime({
  callConvex: async (event, principal) => createServerConvexCaller(event, { principal }),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveCapabilities: async ({ principal, convex }) => {
    if (principal.kind !== 'agent') {
      return {
        readWorkspaceRunbooks: false,
        writeWorkspaceRunbooks: false,
        deleteWorkspaceRunbooks: false,
      }
    }

    const permissions = await convex.query(api.workspaces.getPermissionContext, {})

    return {
      readWorkspaceRunbooks: permissions?.can[mcpReferencePermissionKeys.runbookRead] === true,
      writeWorkspaceRunbooks: permissions?.can[mcpReferencePermissionKeys.runbookCreate] === true,
      deleteWorkspaceRunbooks: permissions?.role === 'owner' || permissions?.role === 'admin',
    }
  },
  principalKey: (principal) =>
    principal.kind === 'agent'
      ? `agent:${principal.agentId}`
      : principal.kind,
})

export const projectTool = mcpRuntime.projectTool
