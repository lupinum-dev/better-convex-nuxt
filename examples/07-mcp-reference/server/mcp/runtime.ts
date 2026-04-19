import type { Delegation } from '@lupinum/trellis/functions'
import type { H3Event } from 'h3'

import { api } from '#trellis/api'
import { defineMcpApp } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import {
  mcpManage,
  runbookBulkDelete,
  runbookCreate,
  runbookDelete,
  runbookPublish,
  runbookRead,
  type McpReferencePermissionKey,
} from '~/convex/auth/permissions'
import type { McpReferencePrincipal } from '~/convex/auth/principal'

type McpAuthContext = {
  keyId?: string
  userId?: string
}

type CapabilitySnapshot = Record<McpReferencePermissionKey, boolean>

function getMcpPrincipal(event: H3Event): McpReferencePrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.keyId || !auth.userId) {
    return { kind: 'anonymous', subject: 'system:anonymous' }
  }

  // The MCP key identifies the real caller. Do not collapse it into the user.
  return {
    kind: 'agent',
    agentId: auth.keyId,
    subject: `agent:${auth.keyId}`,
    provider: 'mcp',
  }
}

function getMcpDelegation(event: H3Event): Delegation | null {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.userId) return null

  // MCP sessions in this example are user-approved, so the key may act for one user.
  return {
    subject: `user:${auth.userId}`,
    reason: 'user-approved MCP session',
  }
}

export const mcpRuntime = defineMcpApp<McpReferencePrincipal, CapabilitySnapshot, Delegation>({
  callConvex: async (event, { principal, delegation }) => {
    if (principal.kind !== 'agent') {
      return createServerConvexCaller(event, { auth: 'none' })
    }

    // Forward both who is calling and who they are acting for. Trellis binds
    // these on `subject`, not on ad hoc fields like `userId`.
    const trustedOptions = delegation
      ? { auth: 'trusted' as const, principal, delegation }
      : { auth: 'trusted' as const, principal }

    return createServerConvexCaller(event, trustedOptions)
  },
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveDelegation: async ({ event }) => getMcpDelegation(event),
  resolveCapabilities: async ({ principal, convex }) => {
    if (principal.kind !== 'agent') {
      // Keep anonymous and non-agent callers on an empty capability baseline.
      return {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [runbookDelete.key]: false,
        [runbookPublish.key]: false,
        [runbookBulkDelete.key]: false,
        [mcpManage.key]: false,
      }
    }

    const permissions = await convex.query(api.permissions.context.getPermissionContext, {})

    // Capabilities come from the delegated user context, not from the MCP key itself.
    return (
      permissions?.can ?? {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [runbookDelete.key]: false,
        [runbookPublish.key]: false,
        [runbookBulkDelete.key]: false,
        [mcpManage.key]: false,
      }
    )
  },
  principalKey: (principal) =>
    principal.kind === 'agent' ? `agent:${principal.agentId}` : principal.kind,
})

export const tool = mcpRuntime.tool
export default mcpRuntime
