import type { H3Event } from 'h3'

import { api } from '#trellis/api'
import { defineMcpApp } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import type { McpReferencePrincipal } from '~/convex/auth/principal'
import {
  mcpManage,
  runbookBulkDelete,
  runbookCreate,
  runbookDelete,
  runbookRead,
  type McpReferencePermissionKey,
} from '~/convex/auth/permissions'

type McpAuthContext = {
  keyId?: string
  userId?: string
}

type CapabilitySnapshot = Record<McpReferencePermissionKey, boolean>

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

export const mcpRuntime = defineMcpApp<McpReferencePrincipal, CapabilitySnapshot>({
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
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [runbookDelete.key]: false,
        [runbookBulkDelete.key]: false,
        [mcpManage.key]: false,
      }
    }

    const permissions = await convex.query(api.permissions.context.getPermissionContext, {})

    return (
      permissions?.can ?? {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [runbookDelete.key]: false,
        [runbookBulkDelete.key]: false,
        [mcpManage.key]: false,
      }
    )
  },
  principalKey: (principal) =>
    principal.kind === 'agent'
      ? `agent:${principal.agentId}`
      : principal.kind,
})

export const tool = mcpRuntime.tool
